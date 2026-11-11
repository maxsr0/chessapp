"""Global analysis queue.

ANALYSIS_WORKERS threads each own one single-threaded Stockfish process and analyze
queued games oldest-first, across all users. A worker claims a game by flipping it from
"queued" to "analyzing" in one conditional UPDATE, so two workers never take the same game.
CPU use stays bounded no matter how many people use the site.
"""

import logging
import os
import threading
from datetime import datetime, timezone

import chess.engine
from sqlmodel import Session, delete, func, select, update

from app.analysis import analyze_pgn, open_engine
from app.db import engine as db_engine
from app.models import Game, MoveAnalysis

log = logging.getLogger(__name__)

_wake = threading.Event()
_stop = threading.Event()
_threads: list[threading.Thread] = []

# Parallel engines. Each uses Threads=1, so results stay reproducible. Default leaves a core free.
WORKERS = max(1, int(os.getenv("ANALYSIS_WORKERS", str(min(4, max(1, (os.cpu_count() or 2) - 1))))))
ACTIVE = ("queued", "analyzing")


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
    first = session.exec(
        select(func.min(Game.queued_at)).where(Game.username == username, Game.analysis_status.in_(ACTIVE))
    ).one()
    ahead = 0
    if first is not None:  # games from other users queued before ours
        ahead = session.exec(
            select(func.count()).select_from(Game).where(
                Game.analysis_status.in_(ACTIVE), Game.queued_at < first, Game.username != username
            )
        ).one()
    running = any(counts.get(s, 0) for s in ACTIVE)
    return {"running": running, "counts": counts, "games_ahead": ahead}


def _claim(session: Session) -> Game | None:
    """Atomically take the oldest queued game, or None if the queue is empty."""
    while True:
        gid = session.exec(
            select(Game.id).where(Game.analysis_status == "queued").order_by(Game.queued_at, Game.id).limit(1)
        ).first()
        if gid is None:
            return None
        took = session.exec(
            update(Game).where(Game.id == gid, Game.analysis_status == "queued").values(analysis_status="analyzing")
        ).rowcount
        session.commit()
        if took:
            return session.get(Game, gid)
        # another worker won the race; try the next one


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

    session.exec(delete(MoveAnalysis).where(MoveAnalysis.game_id == game.id))
    mine = []
    for r in rows:
        is_player = r["color"] == game.color
        session.add(MoveAnalysis(game_id=game.id, is_player=is_player, **r))
        if is_player:
            mine.append(r["accuracy"])
    game.accuracy = round(sum(mine) / len(mine), 2) if mine else None
    game.analysis_status = "done"
    session.commit()
    return True


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
        update(Game).where(Game.analysis_status == "analyzing").values(analysis_status="queued")
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
