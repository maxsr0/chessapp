import shutil

import pytest

from app.analysis import STOCKFISH_PATH, classify, move_accuracy, open_engine, win_pct


def test_win_pct_symmetry():
    assert win_pct(0) == pytest.approx(50)
    assert win_pct(300) + win_pct(-300) == pytest.approx(100)
    assert win_pct(10000) > 99.9


def test_classify():
    assert classify(0, True) == "best"
    assert classify(2, False) == "good"
    assert classify(6, False) == "inaccuracy"
    assert classify(12, False) == "mistake"
    assert classify(40, False) == "blunder"


def test_accuracy_bounds():
    assert move_accuracy(0) == pytest.approx(100, abs=0.1)
    assert move_accuracy(100) == 0


needs_engine = pytest.mark.skipif(
    shutil.which(STOCKFISH_PATH) is None, reason="Stockfish not available"
)

# Scholar's mate: Black's 3...Nf6?? allows Qxf7#
SCHOLARS = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0"


@needs_engine
def test_black_blunder_and_mate():
    from app.analysis import analyze_pgn

    with open_engine() as sf:
        rows = analyze_pgn(SCHOLARS, sf)
    by_san = {r["san"]: r for r in rows}

    nf6 = by_san["Nf6"]
    assert nf6["color"] == "black"
    assert nf6["classification"] == "blunder"
    assert nf6["eval_after"] == -9999  # mate in 1 against black (10000 - 1)

    mate = by_san["Qxf7#"]
    assert mate["color"] == "white"
    assert mate["eval_after"] == 10000
    assert mate["classification"] in {"best", "good"}

    assert by_san["e4"]["classification"] in {"best", "good"}


def test_eval_cache_skips_repeated_positions():
    import chess
    import chess.engine

    from app import analysis

    class FakeEngine:
        calls = 0

        def analyse(self, board, limit):
            FakeEngine.calls += 1
            return {"score": chess.engine.PovScore(chess.engine.Cp(20), board.turn), "pv": [next(iter(board.legal_moves))]}

    analysis._cache.clear()
    pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1/2-1/2"
    sf = FakeEngine()
    first = analysis.analyze_pgn(pgn, sf)
    n = FakeEngine.calls
    assert n == 7  # start position + 6 plies
    assert analysis.analyze_pgn(pgn, sf) == first  # same results...
    assert FakeEngine.calls == n  # ...with no new engine calls
    analysis._cache.clear()  # keep fake evals out of other tests
