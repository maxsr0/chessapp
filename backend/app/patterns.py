"""Tactical pattern detection for a player's mistake.

Given the position right after the player's move and the opponent's best reply
(from the engine), decide *why* the move was bad.
"""

import chess

VALUES = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 100,
}


def tactic_tags(fen_after: str, reply_san: str, me: chess.Color) -> list[str]:
    """Tags describing what the opponent's best reply exploits."""
    board = chess.Board(fen_after)
    try:
        reply = board.parse_san(reply_san)
    except ValueError:
        return []

    tags = []
    attacker = board.piece_at(reply.from_square)
    victim = board.piece_at(reply.to_square)

    # Hung piece: wins a piece worth >= 3 that was undefended, or with a cheaper piece
    if victim and victim.color == me and VALUES[victim.piece_type] >= 3:
        defended = board.is_attacked_by(me, reply.to_square)
        if not defended or VALUES[victim.piece_type] > VALUES[attacker.piece_type]:
            tags.append("hung_piece")

    board.push(reply)

    if board.is_checkmate():
        tags.append("allowed_mate")
        back_rank = chess.square_rank(board.king(me)) == (0 if me == chess.WHITE else 7)
        if back_rank and attacker.piece_type in (chess.ROOK, chess.QUEEN):
            tags.append("back_rank_mate")
        return tags

    # Fork: the moved piece now attacks 2+ of my valuable pieces (knight+ or king)
    targets = [
        sq for sq in board.attacks(reply.to_square)
        if (p := board.piece_at(sq)) and p.color == me and VALUES[p.piece_type] >= 3
    ]
    if len(targets) >= 2:
        tags.append("allowed_fork")

    return tags
