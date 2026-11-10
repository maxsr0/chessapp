from contextlib import asynccontextmanager
from datetime import datetime, timezone

from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session, func, select

from app import chesscom, jobs, stats

STATIC_DIR = Path(__file__).parent / "static"
from app.db import get_session, init_db
from app.models import Game, MoveAnalysis, Player


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


@app.post("/players/{username}/analyze")
def start_analysis(username: str, background: BackgroundTasks) -> dict:
    username = username.lower()
    if not jobs.try_start(username):
        return {"started": False, "reason": "already running"}
    background.add_task(jobs.analyze_player, username)
    return {"started": True}


@app.get("/players/{username}/analysis-status")
def analysis_status(username: str, session: Session = Depends(get_session)) -> dict:
    username = username.lower()
    rows = session.exec(
        select(Game.analysis_status, func.count())
        .where(Game.username == username)
        .group_by(Game.analysis_status)
    ).all()
    return {"running": jobs.is_running(username), "counts": dict(rows)}


@app.get("/games/{game_id}/moves")
def game_moves(game_id: int, session: Session = Depends(get_session)) -> dict:
    game = session.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    moves = session.exec(
        select(MoveAnalysis).where(MoveAnalysis.game_id == game_id).order_by(MoveAnalysis.ply)
    ).all()
    return {"game": game.model_dump(exclude={"pgn"}), "moves": moves}


@app.get("/players/{username}/stats/overview")
def stats_overview(username: str, session: Session = Depends(get_session)) -> dict:
    return stats.overview(session, username.lower())


@app.get("/players/{username}/stats/openings")
def stats_openings(
    username: str,
    min_games: int = 3,
    family: bool = True,
    session: Session = Depends(get_session),
) -> list[dict]:
    return stats.openings(session, username.lower(), min_games, family)


@app.get("/players/{username}/stats/weaknesses")
def stats_weaknesses(username: str, session: Session = Depends(get_session)) -> dict:
    return stats.weaknesses(session, username.lower())


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
