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
    analysis_status: str = Field(default="pending", index=True)  # pending | queued | analyzing | done | error
    queued_at: datetime | None = None  # when it entered the analysis queue (round-robin tie-break)
    accuracy: float | None = None  # player's average move accuracy
    # Set while a visitor's browser is analyzing this game (see jobs.client_claim).
    lease_token: str | None = None
    leased_at: datetime | None = None


class MoveAnalysis(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    game_id: int = Field(foreign_key="game.id", index=True)
    ply: int
    color: str  # who made this move
    is_player: bool  # True if the analyzed player made it
    san: str
    uci: str
    fen_before: str
    eval_before: int  # centipawns, mover's perspective
    eval_after: int
    win_drop: float
    accuracy: float
    classification: str  # best | good | inaccuracy | mistake | blunder
    best_move: str | None
    clock: float | None
