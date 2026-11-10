"""Aggregate statistics with pandas.

Patterns are derived from stored MoveAnalysis rows at query time:
- phase: opening (first 10 moves each), endgame (little non-pawn material), else middlegame
- tags on the player's mistakes/blunders (see patterns.py):
    hung_piece / allowed_fork / allowed_mate / back_rank_mate
    missed_mate      - you had a forced mate and didn't keep it
    time_trouble     - under 10% of base time (or 20s) left on the clock
"""

import chess
import pandas as pd
from sqlmodel import Session, func, select

from app.chesscom import opening_family
from app.models import Game, MoveAnalysis
from app.patterns import tactic_tags

PIECE_VALUES = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
ERRORS = ("mistake", "blunder")


def games_df(session: Session, username: str) -> pd.DataFrame:
    rows = session.exec(select(Game).where(Game.username == username)).all()
    df = pd.DataFrame([g.model_dump(exclude={"pgn"}) for g in rows])
    if not df.empty:
        df["end_time"] = pd.to_datetime(df["end_time"], utc=True)
        df["month"] = df["end_time"].dt.strftime("%Y-%m")
    return df


_cache: dict[str, tuple[int, pd.DataFrame]] = {}


def moves_df(session: Session, username: str) -> pd.DataFrame:
    """Cached by number of analyzed games, so it refreshes when analysis progresses."""
    n_done = session.exec(
        select(func.count()).select_from(Game)
        .where(Game.username == username, Game.analysis_status == "done")
    ).one()
    hit = _cache.get(username)
    if hit and hit[0] == n_done:
        return hit[1].copy()
    df = _build_moves_df(session, username)
    _cache[username] = (n_done, df)
    return df.copy()


def _build_moves_df(session: Session, username: str) -> pd.DataFrame:
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

    # opponent's best reply = the next ply's best_move, from the next ply's position
    df["reply_best"] = df.groupby("game_id")["best_move"].shift(-1)
    df["reply_fen"] = df.groupby("game_id")["fen_before"].shift(-1)
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
    if isinstance(r.reply_best, str) and isinstance(r.reply_fen, str):  # NaN when missing
        me = chess.WHITE if r.color == "white" else chess.BLACK
        out += tactic_tags(r.reply_fen, r.reply_best, me)
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

    def win_table(key) -> list[dict]:
        t = g.groupby(key, observed=True).agg(
            games=("id", "count"),
            win_rate=("result", lambda s: 100 * (s == "win").mean()),
            accuracy=("accuracy", "mean"),
        )
        return _records(t.reset_index().astype({t.index.name or key: str}))

    g["rating_diff"] = pd.cut(
        g["opponent_rating"] - g["player_rating"],
        bins=[-10000, -200, -100, -25, 25, 100, 200, 10000],
        labels=["-200 or lower", "-200 to -100", "-100 to -25", "even (±25)", "+25 to +100", "+100 to +200", "+200 or higher"],
    )
    g["hour"] = g["end_time"].dt.tz_convert(None).dt.hour  # UTC hour the game ended

    return {
        "by_rating_diff": win_table("rating_diff"),
        "by_hour": win_table("hour"),
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


TAG_ADVICE = {
    "hung_piece": (
        "You hang pieces",
        "Before each move, check every piece the opponent can capture after it (blunder check).",
    ),
    "allowed_fork": ("You walk into forks", "Watch for knight jumps and queen moves that hit two pieces at once."),
    "allowed_mate": ("You allow mating attacks", "Check for opponent checks and mate threats before moving."),
    "back_rank_mate": ("Back-rank weakness", "Make luft (a pawn move for your king) once the position calms down."),
    "missed_mate": ("You miss forced mates", "Practice mate-in-2/3 puzzles; look for checks first when ahead."),
    "time_trouble": ("Your errors come when low on time", "Spend less time early; play faster in the opening you know."),
}


def study_plan(session: Session, username: str) -> dict:
    """Rank the player's weaknesses and pick puzzles from their own blunders."""
    g = games_df(session, username)
    m = moves_df(session, username)
    if g.empty or m.empty:
        return {"priorities": [], "puzzles": []}

    items = []  # (score, title, detail)

    # 1. Weakest phase relative to the average error rate
    ph = m.groupby("phase")["is_error"].mean() * 100
    avg = m["is_error"].mean() * 100
    worst = ph.idxmax()
    items.append((
        ph[worst] / avg,
        f"Most errors in the {worst}",
        f"{ph[worst]:.1f} mistakes+blunders per 100 moves vs {avg:.1f} overall. "
        + {"opening": "Review your opening lines and principles.",
           "middlegame": "Do tactics puzzles and slow down in sharp positions.",
           "endgame": "Study basic endgames (king activity, rook endings)."}[worst],
    ))

    # 2. Most common mistake pattern
    errors = m[m["is_error"]]
    tag_counts = errors["tags"].explode().dropna().value_counts().drop("time_trouble", errors="ignore")
    for tag, count in tag_counts.head(2).items():
        title, advice = TAG_ADVICE.get(tag, (tag, ""))
        share = count / max(len(errors), 1)
        items.append((1 + share, title, f"{count} of your {len(errors)} errors ({share:.0%}). {advice}"))

    # 3. Openings that score much worse than your average
    overall_wr = (g["result"] == "win").mean() * 100
    fam = g.assign(family=g["opening"].map(opening_family))
    op = fam.groupby(["family", "color"]).agg(games=("id", "count"), wr=("result", lambda s: (s == "win").mean() * 100))
    for (name, color), r in op[(op["games"] >= 5) & (op["wr"] < overall_wr - 10)].sort_values("wr").head(2).iterrows():
        n = int(r.games)
        items.append((
            1 + (overall_wr - r.wr) / 100 * (n ** 0.5),
            f"You struggle in the {name} (as {color})",
            f"{r.wr:.0f}% wins in {n} games vs {overall_wr:.0f}% overall. Study its typical plans and traps.",
        ))

    # 4. Time trouble effect
    timed = m[m["base_time"].notna() & m["clock"].notna()]
    if not timed.empty:
        low = timed["clock"] < (0.1 * timed["base_time"]).clip(lower=20)
        if low.sum() >= 30:
            lo, hi = timed[low]["is_error"].mean(), timed[~low]["is_error"].mean()
            if hi and lo > 1.3 * hi:
                items.append((lo / hi, "You crack under time pressure",
                              f"Error rate {lo:.0%} when low on clock vs {hi:.0%} otherwise. Manage your clock earlier."))

    items.sort(key=lambda x: x[0], reverse=True)
    priorities = [{"rank": i + 1, "title": t, "detail": d} for i, (_, t, d) in enumerate(items)]

    # Puzzles: your blunders where you weren't already lost and a best move exists
    pz = m[
        (m["classification"].isin(ERRORS))
        & m["best_move"].notna()
        & (m["eval_before"] > -150)
        & (m["win_drop"] >= 15)
    ].sort_values("end_time", ascending=False).head(40)
    puzzles = _records(pz[["game_id", "ply", "fen_before", "san", "best_move", "win_drop", "phase", "opening", "tags"]])
    return {"priorities": priorities, "puzzles": puzzles}


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
