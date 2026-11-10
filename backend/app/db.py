import os
from collections.abc import Iterator

from dotenv import load_dotenv
from sqlmodel import Session, create_engine

load_dotenv()


def _normalize(url: str) -> str:
    # Neon/Render give "postgres://" or "postgresql://"; SQLAlchemy needs the psycopg driver name
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _normalize(os.getenv("DATABASE_URL", "sqlite:///chessiq.db"))

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)


def run_migrations() -> None:
    """Bring the schema up to date (alembic upgrade head)."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "migrations"))
    command.upgrade(cfg, "head")


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
