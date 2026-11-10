from datetime import datetime

from sqlmodel import Field, SQLModel


class Player(SQLModel, table=True):
    username: str = Field(primary_key=True)  # stored lowercase
    last_import: datetime | None = None


class Game(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    url: str = Field(unique=True, index=True)
    username: str = Field(foreign_key="player.username", index=True)
    color: str  # "white" | "black" (the player's color)
    result: str  # "win" | "draw" | "loss" (from the player's side)
    result_detail: str  # raw chess.com code, e.g. "checkmated", "timeout"
    player_rating: int
    opponent: str
    opponent_rating: int
    time_class: str  # bullet / blitz / rapid / daily
    time_control: str
    rated: bool
    end_time: datetime = Field(index=True)
    eco_url: str | None = None
    opening: str | None = None
    pgn: str
    analysis_status: str = "pending"  # pending | done | error
