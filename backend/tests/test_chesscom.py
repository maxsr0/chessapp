from app.chesscom import normalize_result, opening_from_eco_url, parse_game

RAW = {
    "url": "https://www.chess.com/game/live/1",
    "pgn": "1. e4 e5 *",
    "time_control": "600",
    "end_time": 1700000000,
    "rated": True,
    "time_class": "rapid",
    "rules": "chess",
    "eco": "https://www.chess.com/openings/Sicilian-Defense-Open-2...Nc6",
    "white": {"username": "Opp", "rating": 1200, "result": "checkmated"},
    "black": {"username": "BestPlayerDuck", "rating": 1150, "result": "win"},
}


def test_opening_name():
    assert opening_from_eco_url(RAW["eco"]) == "Sicilian Defense Open"
    assert opening_from_eco_url(None) is None


def test_results():
    assert normalize_result("win") == "win"
    assert normalize_result("stalemate") == "draw"
    assert normalize_result("timeout") == "loss"


def test_parse_game_player_perspective():
    g = parse_game(RAW, "bestplayerduck")
    assert g["color"] == "black"
    assert g["result"] == "win"
    assert g["opponent"] == "Opp"
    assert g["player_rating"] == 1150
