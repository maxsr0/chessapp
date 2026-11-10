import shutil
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app import jobs
from app.analysis import STOCKFISH_PATH, open_engine
from app.db import engine, run_migrations
from app.models import Game, MoveAnalysis, Player

SCHOLARS = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0"


def make_game(session: Session, username: str, url: str, status: str = "pending") -> Game:
    if not session.get(Player, username):
        session.add(Player(username=username))
    g = Game(
        url=url, username=username, color="black", result="loss", result_detail="checkmated",
        player_rating=1000, opponent="x", opponent_rating=1000, time_class="blitz",
        time_control="180", rated=True, end_time=datetime.now(timezone.utc), pgn=SCHOLARS,
        analysis_status=status,
    )
    session.add(g)
    session.commit()
    return g


@pytest.fixture
def session():
    run_migrations()
    with Session(engine) as s:
        yield s
        s.exec(MoveAnalysis.__table__.delete())
        s.exec(Game.__table__.delete())
        s.exec(Player.__table__.delete())
        s.commit()


def test_enqueue_and_queue_position(session):
    make_game(session, "alice", "u1")
    make_game(session, "alice", "u2", status="done")
    assert jobs.enqueue(session, "alice") == 1  # only the unanalyzed one

    # bob queues later, so alice's game is ahead of him
    make_game(session, "bob", "u3")
    jobs.enqueue(session, "bob")
    for g in session.exec(select(Game).where(Game.username == "bob")):
        g.queued_at = datetime.now(timezone.utc) + timedelta(seconds=1)
    session.commit()

    assert jobs.queue_status(session, "bob")["games_ahead"] == 1
    assert jobs.queue_status(session, "alice")["games_ahead"] == 0
    assert jobs.queue_status(session, "alice")["running"] is True


@pytest.mark.skipif(shutil.which(STOCKFISH_PATH) is None, reason="Stockfish not available")
def test_process_one_fifo(session):
    first = make_game(session, "alice", "u1")
    jobs.enqueue(session, "alice")
    with open_engine() as sf:
        assert jobs.process_one(session, sf) is True
        session.refresh(first)
        assert first.analysis_status == "done"
        assert first.accuracy is not None
        assert jobs.process_one(session, sf) is False  # queue empty
