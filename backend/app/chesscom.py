"""Chess.com public API client and game parsing.

API docs: https://www.chess.com/news/view/published-data-api
Rules we follow: descriptive User-Agent, one request at a time.
"""

from datetime import datetime, timezone

import httpx

BASE = "https://api.chess.com/pub"
HEADERS = {"User-Agent": "ChessIQ (personal learning project)"}

DRAW_CODES = {
    "agreed", "repetition", "stalemate", "insufficient",
    "50move", "timevsinsufficient",
}


class PlayerNotFound(Exception):
    pass


def make_client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=30)


def get_archives(client: httpx.Client, username: str) -> list[str]:
    """Monthly archive URLs, oldest first."""
    r = client.get(f"{BASE}/player/{username}/games/archives")
    if r.status_code == 404:
        raise PlayerNotFound(username)
    r.raise_for_status()
    return r.json()["archives"]


def get_month(client: httpx.Client, archive_url: str) -> list[dict]:
    r = client.get(archive_url)
    r.raise_for_status()
    return r.json().get("games", [])


def fetch_recent_games(client: httpx.Client, username: str, limit: int) -> list[dict]:
    """Walk archives newest -> oldest (one at a time) until `limit` games are collected."""
    games: list[dict] = []
    for url in reversed(get_archives(client, username)):
        month = [g for g in get_month(client, url) if g.get("rules") == "chess" and "pgn" in g]
        games.extend(sorted(month, key=lambda g: g["end_time"], reverse=True))
        if len(games) >= limit:
            break
    return games[:limit]


def opening_from_eco_url(eco_url: str | None) -> str | None:
    """e.g. .../openings/Sicilian-Defense-Open-2...Nc6 -> Sicilian Defense Open"""
    if not eco_url:
        return None
    words = []
    for token in eco_url.rstrip("/").rsplit("/", 1)[-1].split("-"):
        if token[:1].isdigit():
            break  # move sequence starts here
        words.append(token)
    return " ".join(words) or None


def normalize_result(code: str) -> str:
    if code == "win":
        return "win"
    if code in DRAW_CODES:
        return "draw"
    return "loss"


def parse_game(raw: dict, username: str) -> dict:
    """Turn a chess.com game JSON into Game fields, from the given player's side."""
    username = username.lower()
    color = "white" if raw["white"]["username"].lower() == username else "black"
    me, opp = raw[color], raw["black" if color == "white" else "white"]
    return {
        "url": raw["url"],
        "username": username,
        "color": color,
        "result": normalize_result(me["result"]),
        "result_detail": me["result"],
        "player_rating": me["rating"],
        "opponent": opp["username"],
        "opponent_rating": opp["rating"],
        "time_class": raw.get("time_class", ""),
        "time_control": raw.get("time_control", ""),
        "rated": raw.get("rated", False),
        "end_time": datetime.fromtimestamp(raw["end_time"], tz=timezone.utc),
        "eco_url": raw.get("eco"),
        "opening": opening_from_eco_url(raw.get("eco")),
        "pgn": raw["pgn"],
    }
