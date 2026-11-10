from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlmodel import Session, func, select

from app import chesscom
from app.db import get_session, init_db
from app.models import Game, Player


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ChessIQ", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/players/{username}/import")
def import_games(
    username: str,
    limit: int = Query(200, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> dict:
    username = username.lower()
    try:
        with chesscom.make_client() as client:
            raw_games = chesscom.fetch_recent_games(client, username, limit)
    except chesscom.PlayerNotFound:
        raise HTTPException(404, f"Chess.com player '{username}' not found")

    player = session.get(Player, username) or Player(username=username)
    player.last_import = datetime.now(timezone.utc)
    session.add(player)

    existing = set(session.exec(select(Game.url).where(Game.username == username)))
    added = 0
    for raw in raw_games:
        if raw["url"] in existing:
            continue
        session.add(Game(**chesscom.parse_game(raw, username)))
        added += 1
    session.commit()
    return {"fetched": len(raw_games), "added": added}


@app.get("/players/{username}/games")
def list_games(
    username: str,
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_session),
) -> dict:
    username = username.lower()
    total = session.exec(
        select(func.count()).select_from(Game).where(Game.username == username)
    ).one()
    games = session.exec(
        select(Game).where(Game.username == username).order_by(Game.end_time.desc()).limit(limit)
    ).all()
    return {"total": total, "games": [g.model_dump(exclude={"pgn"}) for g in games]}
