"""Stockfish analysis of a single game.

Approach (same idea as Lichess):
- Evaluate every position once at a fixed depth, with the hash cleared per game
  (reproducible: a game's evals depend only on that game).
- Convert centipawns to win% for the side that just moved.
- A move's "drop" = win% before the move - win% after it (both from the mover's side).
- Classify by drop; per-move accuracy = Lichess accuracy formula.
"""

import io
import math
import os
from dataclasses import dataclass

import chess
import chess.engine
import chess.pgn
from dotenv import load_dotenv

load_dotenv()

STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "stockfish")
DEPTH = int(os.getenv("ANALYSIS_DEPTH", "12"))
MATE_SCORE = 10000

# Win% drop thresholds (0-100 scale)
INACCURACY, MISTAKE, BLUNDER = 5, 10, 15


def open_engine() -> chess.engine.SimpleEngine:
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    engine.configure({"Threads": 1, "Hash": 64})  # fixed settings -> reproducible
    return engine


def win_pct(cp: int) -> float:
    """Centipawns (side to move's view) -> win chance 0..100."""
    return 50 + 50 * (2 / (1 + math.exp(-0.00368206 * cp)) - 1)


def move_accuracy(drop: float) -> float:
    return max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * drop) - 3.1669))


def classify(drop: float, is_best: bool) -> str:
    if is_best:
        return "best"
    if drop >= BLUNDER:
        return "blunder"
    if drop >= MISTAKE:
        return "mistake"
    if drop >= INACCURACY:
        return "inaccuracy"
    return "good"


@dataclass
class PositionEval:
    cp: int  # from side-to-move's perspective
    best: chess.Move | None


def evaluate(engine: chess.engine.SimpleEngine, board: chess.Board, game: object = None) -> PositionEval:
    if (done := terminal_eval(board)) is not None:
        return done
    # A new `game` object makes python-chess send "ucinewgame" (clears the hash), so each game's
    # evals depend only on that game. The browser engine does the same, so results match exactly.
    info = engine.analyse(board, chess.engine.Limit(depth=DEPTH), game=game)
    cp = info["score"].pov(board.turn).score(mate_score=MATE_SCORE)
    pv = info.get("pv") or [None]
    return PositionEval(cp, pv[0])


def terminal_eval(board: chess.Board) -> PositionEval | None:
    """Positions that need no engine: checkmate and other game-over states."""
    if board.is_checkmate():
        return PositionEval(-MATE_SCORE, None)  # side to move is mated
    if board.is_game_over():
        return PositionEval(0, None)  # stalemate / draw
    return None


def game_boards(pgn: str) -> tuple[chess.pgn.Game, list[chess.Board]]:
    """The parsed game plus the board before every ply and after the last one."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("Could not parse PGN")
    board = game.board()
    boards = [board.copy()]
    for node in game.mainline():
        board.push(node.move)
        boards.append(board.copy())
    return game, boards


def analyze_pgn(pgn: str, engine: chess.engine.SimpleEngine) -> list[dict]:
    """Return one dict per ply with evals from the mover's perspective."""
    game, boards = game_boards(pgn)
    key = object()
    return build_rows(game, [evaluate(engine, b, key) for b in boards])


def build_rows(game: chess.pgn.Game, evals: list[PositionEval]) -> list[dict]:
    """Turn one eval per position (from the side to move) into per-ply rows.

    Shared by the server engine and browser-submitted evals, so both are graded identically.
    """
    board = game.board()
    rows = []
    for ply, node in enumerate(game.mainline(), start=1):
        before, after = evals[ply - 1], evals[ply]
        mover = board.turn
        fen_before = board.fen()
        san = board.san(node.move)
        board.push(node.move)

        cp_before = before.cp
        cp_after = -after.cp  # flip: after.cp is from the opponent's view
        drop = max(0.0, win_pct(cp_before) - win_pct(cp_after))
        is_best = before.best == node.move
        rows.append({
            "ply": ply,
            "color": "white" if mover == chess.WHITE else "black",
            "san": san,
            "uci": node.move.uci(),
            "fen_before": fen_before,
            "eval_before": cp_before,
            "eval_after": cp_after,
            "win_drop": round(drop, 2),
            "accuracy": round(move_accuracy(drop), 2),
            "classification": classify(drop, is_best),
            "best_move": board_san_safe(fen_before, before.best),
            "clock": node.clock(),  # seconds left after the move, from %clk
        })
    return rows


def board_san_safe(fen: str, move: chess.Move | None) -> str | None:
    if move is None:
        return None
    return chess.Board(fen).san(move)
