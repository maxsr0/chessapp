import json
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

    # round-robin: each other user with queued work may get a turn before ours
    assert jobs.queue_status(session, "bob")["games_ahead"] == 1
    assert jobs.queue_status(session, "alice")["games_ahead"] == 1
    jobs._claim(session)  # once one of alice's games is in flight, she isn't waiting
    session.expire_all()
    owner = session.exec(select(Game).where(Game.analysis_status == "analyzing")).one().username
    assert jobs.queue_status(session, owner)["games_ahead"] == 0
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


def test_claim_is_exclusive_and_requeue(session):
    make_game(session, "alice", "u1")
    make_game(session, "alice", "u2")
    jobs.enqueue(session, "alice")

    a = jobs._claim(session)
    b = jobs._claim(session)
    assert a is not None and b is not None and a.id != b.id  # two workers, two different games
    assert jobs._claim(session) is None  # nothing left to take
    assert jobs.queue_status(session, "alice")["running"] is True  # still analyzing

    # a restart puts in-flight games back in the queue
    assert jobs.requeue_interrupted(session) == 2
    session.expire_all()
    assert {g.analysis_status for g in session.exec(select(Game))} == {"queued"}


def test_round_robin_claim(session):
    jobs._last_served.clear()
    base = datetime.now(timezone.utc)
    for i in range(6):
        make_game(session, "alice", f"a{i}")
    jobs.enqueue(session, "alice")
    a_first = jobs._claim(session)
    assert a_first.username == "alice"

    # bob arrives later with two games; he must not wait behind alice's remaining five
    for i in range(2):
        g = make_game(session, "bob", f"b{i}")
        g.end_time = base + timedelta(minutes=i)
        session.commit()
    jobs.enqueue(session, "bob")
    order = []
    while (g := jobs._claim(session)) is not None:
        order.append((g.username, g.url))
    assert [u for u, _ in order] == ["bob", "alice", "bob", "alice", "alice", "alice", "alice"][:len(order)]
    assert order[0][1] == "b1"  # newest game first within a user


# ---- browser analysis ----

def _fake_evals(work):
    """A legal 'engine' answer for every position: score 0, first legal move."""
    import chess
    b = chess.Board(work["start_fen"])
    out = []
    for i, p in enumerate(work["positions"]):
        out.append(None if p["terminal"] else {"cp": 0, "best": next(iter(b.legal_moves)).uci()})
        if i < len(work["moves"]):
            b.push_uci(work["moves"][i])
    return out


def _client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_client_claim_submit_roundtrip(session):
    make_game(session, "alice", "u1")
    jobs.enqueue(session, "alice")
    c = _client()

    r = c.post("/players/alice/client-claim")
    assert r.status_code == 200
    work = r.json()
    assert len(work["positions"]) == 8  # start + 7 plies
    assert work["positions"][-1]["terminal"] is True  # Qxf7#
    assert c.post("/players/alice/client-claim").status_code == 204  # nothing else queued

    # text/plain body, the way the browser sends it (no CORS preflight)
    r = c.post(f"/games/{work['game_id']}/client-result",
               content=json.dumps({"token": work["token"], "evals": _fake_evals(work)}),
               headers={"content-type": "text/plain"})
    assert r.status_code == 200, r.text
    session.expire_all()
    g = session.get(Game, work["game_id"])
    assert g.analysis_status == "done" and g.lease_token is None
    rows = session.exec(select(MoveAnalysis).where(MoveAnalysis.game_id == g.id)).all()
    assert len(rows) == 7

    # the token can't be reused
    r = c.post(f"/games/{work['game_id']}/client-result",
               content=json.dumps({"token": work["token"], "evals": _fake_evals(work)}))
    assert r.status_code == 409


def test_client_bad_result_is_rejected_and_requeued(session):
    make_game(session, "alice", "u1")
    jobs.enqueue(session, "alice")
    c = _client()
    work = c.post("/players/alice/client-claim").json()
    evals = _fake_evals(work)
    evals[1] = {"cp": 0, "best": "e1e8"}  # illegal move
    r = c.post(f"/games/{work['game_id']}/client-result", content=json.dumps({"token": work["token"], "evals": evals}))
    assert r.status_code == 422
    evals[1] = {"cp": 50_000, "best": evals[2]["best"]}  # out of range (and wrong position)
    session.expire_all()
    assert session.get(Game, work["game_id"]).analysis_status == "queued"  # back for the server

    wrong = c.post(f"/games/{work['game_id']}/client-result", content=json.dumps({"token": "nope", "evals": evals}))
    assert wrong.status_code == 409


def test_client_release_and_lease_expiry(session):
    make_game(session, "alice", "u1")
    jobs.enqueue(session, "alice")
    c = _client()
    work = c.post("/players/alice/client-claim").json()
    assert jobs._claim(session) is None  # leased games aren't taken by server workers
    assert c.post(f"/games/{work['game_id']}/client-release", content=json.dumps({"token": work["token"]})).status_code == 200
    session.expire_all()
    assert session.get(Game, work["game_id"]).analysis_status == "queued"

    # a browser that vanishes: its lease runs out and the game goes back in the queue
    work = c.post("/players/alice/client-claim").json()
    g = session.get(Game, work["game_id"])
    session.refresh(g)
    g.leased_at = datetime.now(timezone.utc) - jobs.LEASE - timedelta(seconds=1)
    session.commit()
    assert jobs.expire_leases(session) == 1
    session.expire_all()
    assert session.get(Game, work["game_id"]).lease_token is None
