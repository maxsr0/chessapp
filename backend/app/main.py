import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlmodel import Session, func, select

from app import chesscom, jobs, stats
from app.db import get_session, run_migrations
from app.models import Game, MoveAnalysis, Player

STATIC_DIR = Path(__file__).parent / "static"
MAX_IMPORT = int(os.getenv("MAX_IMPORT", "100"))
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://maxwellrobbins.com"
).split(",")
RUN_WORKER = os.getenv("RUN_WORKER", "1") == "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    if RUN_WORKER:
        jobs.start_worker()
    yield
    jobs.stop_worker()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="ChessIQ", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"]
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _import(session: Session, username: str, limit: int) -> dict:
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


@app.post("/players/{username}/import")
@limiter.limit("10/minute")
def import_games(
    request: Request,
    username: str,
    limit: int = Query(50, ge=1),
    session: Session = Depends(get_session),
) -> dict:
    return _import(session, username.lower(), min(limit, MAX_IMPORT))


@app.post("/players/{username}/analyze")
@limiter.limit("10/minute")
def start_analysis(request: Request, username: str, session: Session = Depends(get_session)) -> dict:
    return {"queued": jobs.enqueue(session, username.lower())}


@app.post("/players/{username}/sync")
@limiter.limit("5/minute")
def sync(
    request: Request,
    username: str,
    limit: int = Query(50, ge=1),
    session: Session = Depends(get_session),
) -> dict:
    """Import recent games and queue everything unanalyzed, in one call."""
    username = username.lower()
    result = _import(session, username, min(limit, MAX_IMPORT))
    result["queued"] = jobs.enqueue(session, username)
    return result


@app.get("/players/{username}/analysis-status")
def analysis_status(username: str, session: Session = Depends(get_session)) -> dict:
    return jobs.queue_status(session, username.lower())


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


@app.get("/players/{username}/study-plan")
def study_plan(username: str, session: Session = Depends(get_session)) -> dict:
    return stats.study_plan(session, username.lower())


FRONTEND_URL = os.getenv("FRONTEND_URL", "https://maxwellrobbins.com/chessapp/")


# The API has no UI of its own; send browsers to the real site.
@app.get("/", include_in_schema=False)
def index() -> RedirectResponse:
    return RedirectResponse(FRONTEND_URL)


# Legacy vanilla-JS dashboard, still handy for local debugging.
@app.get("/legacy", include_in_schema=False)
def legacy() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
