"""Global analysis queue.

One worker thread owns one Stockfish process and analyzes queued games oldest-first,
across all users. This keeps CPU use bounded no matter how many people use the site.
"""

import logging
import threading
from datetime import datetime, timezone

import chess.engine
from sqlmodel import Session, delete, func, select

from app.analysis import analyze_pgn, open_engine
from app.db import engine as db_engine
from app.models import Game, MoveAnalysis

log = logging.getLogger(__name__)

_wake = threading.Event()
_stop = threading.Event()
_thread: threading.Thread | None = None


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
        select(func.min(Game.queued_at)).where(Game.username == username, Game.analysis_status == "queued")
    ).one()
    ahead = 0
    if first is not None:  # games from other users queued before ours
        ahead = session.exec(
            select(func.count()).select_from(Game).where(
                Game.analysis_status == "queued", Game.queued_at < first, Game.username != username
            )
        ).one()
    return {"running": counts.get("queued", 0) > 0, "counts": counts, "games_ahead": ahead}


def process_one(session: Session, sf: chess.engine.SimpleEngine) -> bool:
    """Analyze the oldest queued game. Returns False if the queue is empty."""
    game = session.exec(
        select(Game).where(Game.analysis_status == "queued").order_by(Game.queued_at, Game.id).limit(1)
    ).first()
    if game is None:
        return False
    try:
        rows = analyze_pgn(game.pgn, sf)
    except chess.engine.EngineTerminatedError:
        raise  # let the worker restart the engine; game stays queued
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
                        _wake.wait(timeout=5)
                        _wake.clear()
        except Exception:
            log.exception("Worker crashed; restarting in 5s")
            _stop.wait(5)


def start_worker() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_worker, name="analysis-worker", daemon=True)
    _thread.start()


def stop_worker() -> None:
    _stop.set()
    _wake.set()
    if _thread:
        _thread.join(timeout=10)
