"""Global analysis queue.

ANALYSIS_WORKERS threads each own one single-threaded Stockfish process. Users take turns:
each claim goes to the queued user served least recently (a newcomer goes next), and within a
user the newest game goes first, so a big sync never blocks a new visitor. A worker claims a game by flipping it from
"queued" to "analyzing" in one conditional UPDATE, so two workers never take the same game.
CPU use stays bounded no matter how many people use the site.
"""

import logging
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import chess
import chess.engine
from sqlmodel import Session, delete, func, select, update

from app.analysis import (
    DEPTH, MATE_SCORE, PositionEval, analyze_pgn, build_rows, game_boards, open_engine, terminal_eval,
)
from app.db import engine as db_engine
from app.models import Game, MoveAnalysis

log = logging.getLogger(__name__)

_wake = threading.Event()
_stop = threading.Event()
_threads: list[threading.Thread] = []
# Round-robin state: username -> monotonic time of that user's last claim. In-memory is fine:
# after a restart everyone starts even again.
_last_served: dict[str, float] = {}
_served_lock = threading.Lock()

# Parallel engines. Each uses Threads=1, so results stay reproducible. Default leaves a core free.
WORKERS = max(1, int(os.getenv("ANALYSIS_WORKERS", str(min(4, max(1, (os.cpu_count() or 2) - 1))))))
ACTIVE = ("queued", "analyzing")
# A browser that claims a game and then disappears gives it back to the queue after this long.
LEASE = timedelta(seconds=int(os.getenv("CLIENT_LEASE_SECONDS", "120")))


def enqueue(session: Session, username: str) -> int:
    """Queue every not-yet-analyzed game for this user. Returns how many were queued."""
    games = session.exec(
        select(Game).where(Game.username == username, Game.analysis_status.in_(("pending", "error")))
    ).all()
    now = datetime.now(timezone.utc)
    for g in games:
        g.analysis_status = "queued"
        g.queued_at = now
    session.commit()
    if games:
        _wake.set()
    return len(games)


def queue_status(session: Session, username: str) -> dict:
    counts = dict(session.exec(
        select(Game.analysis_status, func.count())
        .where(Game.username == username)
        .group_by(Game.analysis_status)
    ).all())
    ahead = 0
    if counts.get("queued") and not counts.get("analyzing"):
        # turns are round-robin: every other user with queued work may get one game before ours
        ahead = session.exec(
            select(func.count(func.distinct(Game.username))).where(
                Game.analysis_status.in_(ACTIVE), Game.username != username
            )
        ).one()
    running = any(counts.get(s, 0) for s in ACTIVE)
    return {"running": running, "counts": counts, "games_ahead": ahead}


def _next_candidate(session: Session) -> int | None:
    """The newest queued game of the user whose turn it is."""
    users = session.exec(
        select(Game.username, func.min(Game.queued_at))
        .where(Game.analysis_status == "queued")
        .group_by(Game.username)
    ).all()
    if not users:
        return None
    with _served_lock:
        user = min(users, key=lambda u: (_last_served.get(u[0], 0.0), u[1] or datetime.min, u[0]))[0]
    return session.exec(
        select(Game.id).where(Game.username == user, Game.analysis_status == "queued")
        .order_by(Game.end_time.desc(), Game.id.desc()).limit(1)
    ).first()


def _claim(session: Session) -> Game | None:
    """Atomically take the next game in round-robin order, or None if the queue is empty."""
    expire_leases(session)
    while True:
        gid = _next_candidate(session)
        if gid is None:
            return None
        took = session.exec(
            update(Game).where(Game.id == gid, Game.analysis_status == "queued").values(analysis_status="analyzing")
        ).rowcount
        session.commit()
        if took:
            game = session.get(Game, gid)
            with _served_lock:
                _last_served[game.username] = time.monotonic()
            return game
        # another worker won the race; try again


def process_one(session: Session, sf: chess.engine.SimpleEngine) -> bool:
    """Analyze the oldest queued game. Returns False if the queue is empty."""
    game = _claim(session)
    if game is None:
        return False
    try:
        rows = analyze_pgn(game.pgn, sf)
    except chess.engine.EngineTerminatedError:
        game.analysis_status = "queued"  # let the worker restart the engine and retry
        session.commit()
        raise
    except Exception:
        log.exception("Analysis failed for game %s", game.id)
        game.analysis_status = "error"
        session.commit()
        return True

    _store(session, game, rows)
    return True


def _store(session: Session, game: Game, rows: list[dict]) -> None:
    session.exec(delete(MoveAnalysis).where(MoveAnalysis.game_id == game.id))
    mine = []
    for r in rows:
        is_player = r["color"] == game.color
        session.add(MoveAnalysis(game_id=game.id, is_player=is_player, **r))
        if is_player:
            mine.append(r["accuracy"])
    game.accuracy = round(sum(mine) / len(mine), 2) if mine else None
    game.analysis_status = "done"
    game.lease_token = game.leased_at = None
    session.commit()


# ---- Browser analysis -------------------------------------------------------------------
# A visitor's browser can run the same Stockfish build (WebAssembly) on their own games. It
# claims one game at a time with a secret lease token, evaluates the positions, and posts one
# eval per position. The server checks every value and grades moves with the same
# build_rows() as its own engine. Server workers keep draining the queue alongside.


class InvalidResult(ValueError):
    pass


def expire_leases(session: Session) -> int:
    cutoff = datetime.now(timezone.utc) - LEASE
    n = session.exec(
        update(Game).where(Game.analysis_status == "analyzing", Game.lease_token.is_not(None), Game.leased_at < cutoff)
        .values(analysis_status="queued", lease_token=None, leased_at=None)
    ).rowcount
    session.commit()  # always: an UPDATE that matched nothing still holds SQLite's write lock
    if n:
        _wake.set()
    return n


def client_claim(session: Session, username: str) -> dict | None:
    """Lease this user's newest queued game to a browser. Returns the work, or None."""
    expire_leases(session)
    while True:
        gid = session.exec(
            select(Game.id).where(Game.username == username, Game.analysis_status == "queued")
            .order_by(Game.end_time.desc(), Game.id.desc()).limit(1)
        ).first()
        if gid is None:
            return None
        token = secrets.token_urlsafe(24)
        took = session.exec(
            update(Game).where(Game.id == gid, Game.analysis_status == "queued")
            .values(analysis_status="analyzing", lease_token=token, leased_at=datetime.now(timezone.utc))
        ).rowcount
        session.commit()
        if not took:
            continue  # a server worker took it first
        game = session.get(Game, gid)
        try:
            parsed, boards = game_boards(game.pgn)
        except ValueError:
            game.analysis_status, game.lease_token, game.leased_at = "error", None, None
            session.commit()
            continue
        # Position i = start_fen + the first i moves. The browser sends it to the engine the
        # same way python-chess does ("position ... moves ..."), so repetition detection and
        # therefore the evals match the server exactly.
        positions = [{"terminal": terminal_eval(b) is not None} for b in boards]
        start = parsed.board().fen()
        moves = [m.uci() for m in parsed.mainline_moves()]
        return {
            "game_id": gid, "token": token, "depth": DEPTH,
            "start_fen": start, "moves": moves, "positions": positions,
        }


def _lease(session: Session, game_id: int, token: str) -> Game:
    game = session.get(Game, game_id)
    if (
        game is None or game.analysis_status != "analyzing" or not game.lease_token
        or not secrets.compare_digest(game.lease_token, token)
    ):
        raise LookupError("lease not found or expired")
    return game


def client_submit(session: Session, game_id: int, token: str, evals: list[dict | None]) -> Game:
    """Validate a browser's evals (one per position) and store the graded game."""
    game = _lease(session, game_id, token)
    parsed, boards = game_boards(game.pgn)
    if len(evals) != len(boards):
        raise InvalidResult(f"expected {len(boards)} evals, got {len(evals)}")
    out: list[PositionEval] = []
    for i, (b, e) in enumerate(zip(boards, evals)):
        if (fixed := terminal_eval(b)) is not None:
            out.append(fixed)  # game-over positions need no engine; ignore whatever was sent
            continue
        if not isinstance(e, dict):
            raise InvalidResult(f"position {i}: missing eval")
        cp, best = e.get("cp"), e.get("best")
        if not isinstance(cp, int) or isinstance(cp, bool) or not -MATE_SCORE < cp < MATE_SCORE:
            raise InvalidResult(f"position {i}: bad score")
        try:
            move = chess.Move.from_uci(best) if isinstance(best, str) else None
        except ValueError:
            move = None
        if move is None or move not in b.legal_moves:
            raise InvalidResult(f"position {i}: best move is not legal")
        out.append(PositionEval(cp, move))
    _store(session, game, build_rows(parsed, out))
    return game


def client_release(session: Session, game_id: int, token: str) -> None:
    """A browser gives a game back (tab hidden or closed) so the server can finish it."""
    game = _lease(session, game_id, token)
    game.analysis_status, game.lease_token, game.leased_at = "queued", None, None
    session.commit()
    _wake.set()


def _worker() -> None:
    while not _stop.is_set():
        try:
            with open_engine() as sf:
                while not _stop.is_set():
                    with Session(db_engine) as session:
                        worked = process_one(session, sf)
                    if not worked:
                        # clear first, then wait: set() releases every idle worker at once
                        _wake.clear()
                        _wake.wait(timeout=5)
        except Exception:
            log.exception("Worker crashed; restarting in 5s")
            _stop.wait(5)


def requeue_interrupted(session: Session) -> int:
    """Games left "analyzing" by a crash or restart go back in the queue."""
    n = session.exec(
        update(Game).where(Game.analysis_status == "analyzing")
        .values(analysis_status="queued", lease_token=None, leased_at=None)
    ).rowcount
    session.commit()
    return n


def start_worker() -> None:
    if any(t.is_alive() for t in _threads):
        return
    with Session(db_engine) as session:
        if n := requeue_interrupted(session):
            log.info("Re-queued %d interrupted games", n)
    _stop.clear()
    _threads.clear()
    for i in range(WORKERS):
        t = threading.Thread(target=_worker, name=f"analysis-worker-{i}", daemon=True)
        t.start()
        _threads.append(t)
    log.info("Started %d analysis workers", WORKERS)


def stop_worker() -> None:
    _stop.set()
    _wake.set()
    for t in _threads:
        t.join(timeout=10)
