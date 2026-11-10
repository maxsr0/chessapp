import chess

from app.chesscom import opening_family, opening_from_eco_url
from app.stats import base_seconds, phase


def test_opening_name_strips_moves():
    url = "https://www.chess.com/openings/English-Opening-Caro-Kann-Defensive-System...3.b3-d5"
    assert opening_from_eco_url(url) == "English Opening Caro Kann Defensive System"


def test_opening_family():
    assert opening_family("Caro Kann Defense Advance Variation") == "Caro Kann Defense"
    assert opening_family("Queens Gambit Declined Albin Countergambit") == "Queens Gambit"
    assert opening_family("Vienna Game") == "Vienna Game"


def test_phase():
    assert phase(chess.STARTING_FEN, 1) == "opening"
    assert phase(chess.STARTING_FEN, 30) == "middlegame"
    assert phase("4k3/8/8/8/8/8/4R3/4K3 w - - 0 40", 79) == "endgame"


def test_base_seconds():
    assert base_seconds("180+2") == 180
    assert base_seconds("1/86400") is None
