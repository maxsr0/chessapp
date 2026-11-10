"""Background analysis job: analyze all pending games for a player."""

import logging
import threading

from sqlmodel import Session, delete, select

from app.analysis import analyze_pgn, open_engine
from app.db import engine as db_engine
from app.models import Game, MoveAnalysis

log = logging.getLogger(__name__)

_running: set[str] = set()
_lock = threading.Lock()


def is_running(username: str) -> bool:
    return username in _running


def try_start(username: str) -> bool:
    """Reserve the job slot for this user; False if one is already running."""
    with _lock:
        if username in _running:
            return False
        _running.add(username)
        return True


def analyze_player(username: str) -> None:
    try:
        with Session(db_engine) as session, open_engine() as sf:
            game_ids = session.exec(
                select(Game.id).where(Game.username == username, Game.analysis_status != "done")
            ).all()
            for gid in game_ids:
                game = session.get(Game, gid)
                try:
                    rows = analyze_pgn(game.pgn, sf)
                except Exception:
                    log.exception("Analysis failed for game %s", gid)
                    game.analysis_status = "error"
                    session.commit()
                    continue
                session.exec(delete(MoveAnalysis).where(MoveAnalysis.game_id == gid))
                mine = []
                for r in rows:
                    is_player = r["color"] == game.color
                    session.add(MoveAnalysis(game_id=gid, is_player=is_player, **r))
                    if is_player:
                        mine.append(r["accuracy"])
                game.accuracy = round(sum(mine) / len(mine), 2) if mine else None
                game.analysis_status = "done"
                session.commit()  # commit per game so progress is visible
    finally:
        with _lock:
            _running.discard(username)
