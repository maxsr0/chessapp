"""Aggregate statistics with pandas.

Patterns are derived from stored MoveAnalysis rows at query time:
- phase: opening (first 10 moves each), endgame (little non-pawn material), else middlegame
- tags on the player's mistakes/blunders:
    allowed_capture  - opponent's best reply was a capture (you hung something)
    allowed_mate     - opponent's best reply was mate
    missed_mate      - you had a forced mate and didn't keep it
    time_trouble     - under 10% of base time (or 20s) left on the clock
"""

import chess
import pandas as pd
from sqlmodel import Session, select

from app.chesscom import opening_family
from app.models import Game, MoveAnalysis

PIECE_VALUES = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
ERRORS = ("mistake", "blunder")


def games_df(session: Session, username: str) -> pd.DataFrame:
    rows = session.exec(select(Game).where(Game.username == username)).all()
    df = pd.DataFrame([g.model_dump(exclude={"pgn"}) for g in rows])
    if not df.empty:
        df["end_time"] = pd.to_datetime(df["end_time"], utc=True)
        df["month"] = df["end_time"].dt.strftime("%Y-%m")
    return df


def moves_df(session: Session, username: str) -> pd.DataFrame:
    """All moves for the player's analyzed games, with pattern columns added."""
    stmt = (
        select(MoveAnalysis, Game.time_control, Game.end_time, Game.opening, Game.color)
        .join(Game, Game.id == MoveAnalysis.game_id)
        .where(Game.username == username, Game.analysis_status == "done")
    )
    rows = session.exec(stmt).all()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(
        [{**m.model_dump(), "time_control": tc, "end_time": et, "opening": op, "player_color": c}
         for m, tc, et, op, c in rows]
    )
    df = df.sort_values(["game_id", "ply"])
    df["month"] = pd.to_datetime(df["end_time"], utc=True).dt.strftime("%Y-%m")
    df["phase"] = [phase(f, p) for f, p in zip(df["fen_before"], df["ply"])]

    # opponent's best reply = the next ply's best_move in the same game
    df["reply_best"] = df.groupby("game_id")["best_move"].shift(-1)
    df["base_time"] = df["time_control"].map(base_seconds)

    df = df[df["is_player"]].copy()
    df["is_error"] = df["classification"].isin(ERRORS)
    df["tags"] = [tags(r) for r in df.itertuples()]
    return df


def phase(fen: str, ply: int) -> str:
    if ply <= 20:
        return "opening"
    board = chess.Board(fen)
    pieces = sum(
        len(board.pieces(pt, color))
        for pt in PIECE_VALUES
        for color in (chess.WHITE, chess.BLACK)
    )
    return "endgame" if pieces <= 6 else "middlegame"


def base_seconds(tc: str) -> float | None:
    """'600+5' -> 600; daily ('1/86400') -> None."""
    if not tc or "/" in tc:
        return None
    try:
        return float(tc.split("+")[0])
    except ValueError:
        return None


def tags(r) -> list[str]:
    if r.classification not in ERRORS:
        return []
    out = []
    reply = r.reply_best if isinstance(r.reply_best, str) else ""  # NaN when missing
    if "#" in reply:
        out.append("allowed_mate")
    elif "x" in reply:
        out.append("allowed_capture")
    if r.eval_before >= 9000 and r.eval_after < 9000:
        out.append("missed_mate")
    if r.base_time and pd.notna(r.clock) and r.clock < max(20, 0.1 * r.base_time):
        out.append("time_trouble")
    return out


def _records(df: pd.DataFrame) -> list[dict]:
    return df.round(2).to_dict(orient="records")


def overview(session: Session, username: str) -> dict:
    g = games_df(session, username)
    if g.empty:
        return {"games": 0}
    m = moves_df(session, username)
    results = g["result"].value_counts().to_dict()

    rating = (
        g.sort_values("end_time")[["end_time", "time_class", "player_rating"]]
        .assign(end_time=lambda d: d["end_time"].dt.strftime("%Y-%m-%d"))
    )
    by_month = g.groupby("month").agg(
        games=("id", "count"),
        win_rate=("result", lambda s: 100 * (s == "win").mean()),
        accuracy=("accuracy", "mean"),
    )
    if not m.empty:
        per_game = m.groupby(["month", "game_id"])["classification"].apply(
            lambda s: (s == "blunder").sum()
        )
        by_month["blunders_per_game"] = per_game.groupby("month").mean()

    return {
        "games": len(g),
        "results": results,
        "win_rate": round(100 * results.get("win", 0) / len(g), 1),
        "avg_accuracy": round(g["accuracy"].mean(), 1) if g["accuracy"].notna().any() else None,
        "classification_counts": m["classification"].value_counts().to_dict() if not m.empty else {},
        "rating_history": _records(rating),
        "by_month": _records(by_month.reset_index()),
        "by_time_class": _records(
            g.groupby("time_class").agg(
                games=("id", "count"),
                win_rate=("result", lambda s: 100 * (s == "win").mean()),
                accuracy=("accuracy", "mean"),
            ).reset_index()
        ),
    }


def openings(session: Session, username: str, min_games: int = 3, family: bool = True) -> list[dict]:
    g = games_df(session, username)
    if g.empty:
        return []
    m = moves_df(session, username)
    if family:
        g["opening"] = g["opening"].map(opening_family)
        if not m.empty:
            m["opening"] = m["opening"].map(opening_family)
    agg = g.groupby(["opening", "color"]).agg(
        games=("id", "count"),
        wins=("result", lambda s: (s == "win").sum()),
        draws=("result", lambda s: (s == "draw").sum()),
        losses=("result", lambda s: (s == "loss").sum()),
        accuracy=("accuracy", "mean"),
    )
    agg["win_rate"] = 100 * agg["wins"] / agg["games"]
    if not m.empty:
        # errors in the opening phase specifically, per game
        op_err = m[m["phase"] == "opening"].groupby(["opening", "player_color"])["is_error"].sum()
        op_err.index.names = ["opening", "color"]
        agg["opening_errors_per_game"] = (op_err / agg["games"]).fillna(0)
    agg = agg[agg["games"] >= min_games].sort_values("games", ascending=False)
    return _records(agg.reset_index())


def weaknesses(session: Session, username: str) -> dict:
    m = moves_df(session, username)
    if m.empty:
        return {}
    by_phase = m.groupby("phase").agg(
        moves=("ply", "count"),
        errors=("is_error", "sum"),
        blunders=("classification", lambda s: (s == "blunder").sum()),
        accuracy=("accuracy", "mean"),
    )
    by_phase["errors_per_100_moves"] = 100 * by_phase["errors"] / by_phase["moves"]

    tag_counts = m["tags"].explode().dropna().value_counts().to_dict()

    timed = m[m["base_time"].notna() & m["clock"].notna()]
    low = timed["clock"] < (0.1 * timed["base_time"]).clip(lower=20)
    time_trouble = {
        "error_rate_low_clock": round(100 * timed[low]["is_error"].mean(), 2) if low.any() else None,
        "error_rate_normal": round(100 * timed[~low]["is_error"].mean(), 2) if (~low).any() else None,
    }

    trend = m.groupby("month").agg(
        moves=("ply", "count"), errors=("is_error", "sum"), accuracy=("accuracy", "mean")
    )
    trend["errors_per_100_moves"] = 100 * trend["errors"] / trend["moves"]

    worst = (
        m[m["classification"] == "blunder"]
        .sort_values("win_drop", ascending=False)
        .head(15)[["game_id", "ply", "san", "best_move", "win_drop", "phase", "opening", "fen_before", "tags"]]
    )

    return {
        "by_phase": _records(by_phase.reset_index()),
        "tags": tag_counts,
        "time_trouble": time_trouble,
        "trend": _records(trend.reset_index()),
        "worst_blunders": _records(worst),
    }
