import os
from collections.abc import Iterator

from dotenv import load_dotenv
from sqlalchemy import event
from sqlmodel import Session, create_engine

load_dotenv()


def _normalize(url: str) -> str:
    # Neon/Render give "postgres://" or "postgresql://"; SQLAlchemy needs the psycopg driver name
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _normalize(os.getenv("DATABASE_URL", "sqlite:///chessiq.db"))

_sqlite = DATABASE_URL.startswith("sqlite")
# timeout: several analysis workers write concurrently; wait for the lock instead of failing
_connect_args = {"check_same_thread": False, "timeout": 30} if _sqlite else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)

if _sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_wal(dbapi_conn, _record) -> None:
        # WAL lets the API read while a worker writes
        dbapi_conn.execute("PRAGMA journal_mode=WAL")


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
