import chess

from app.patterns import tactic_tags


def test_hung_piece():
    # White knight on e5 undefended; black queen on e7 takes it
    fen = "4k3/4q3/8/4N3/8/8/8/4K3 b - - 0 1"
    assert "hung_piece" in tactic_tags(fen, "Qxe5", chess.WHITE)


def test_defended_equal_trade_is_not_hung():
    # Knight on e5 defended by d4 pawn, taken by a black knight: plain trade
    fen = "4k3/8/5n2/4N3/3P4/8/8/4K3 b - - 0 1"
    assert "hung_piece" not in tactic_tags(fen, "Nxe5", chess.WHITE)


def test_fork():
    # Black knight jumps to c2, forking white king e1 and rook a1
    fen = "4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1"
    assert "allowed_fork" in tactic_tags(fen, "Nc2+", chess.WHITE)


def test_back_rank_mate():
    # White king boxed in by its own pawns; Black rook mates on the back rank
    fen = "r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1"
    tags = tactic_tags(fen, "Ra1#", chess.WHITE)
    assert "allowed_mate" in tags and "back_rank_mate" in tags
