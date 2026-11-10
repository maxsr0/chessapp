# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
ChessIQ: enter a Chess.com username, import games via the public API, analyze every move with Stockfish, and surface patterns (weak openings, recurring mistakes, trends over time). The owner is using it to learn Claude Code, Python APIs, and data analysis. Build milestone by milestone, testing each before moving on. The full plan is in `C:\Users\maxwell.robbins\.claude\plans\steady-wondering-minsky.md`.

## Commands (run from `backend/`)
- Install: `python -m venv .venv` then `.venv/Scripts/python -m pip install -r requirements.txt`
- Dev server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (API docs at http://127.0.0.1:8000/docs)
- Tests: `.venv/Scripts/python -m pytest -q`; one test: `.venv/Scripts/python -m pytest tests/test_health.py::test_health`
- Stockfish: set `STOCKFISH_PATH` in `backend/.env` (see `.env.example`) or put `stockfish` on PATH.

## Architecture
- `backend/app/`: FastAPI + SQLModel (SQLite for now) + python-chess. Modules: `chesscom.py` (API client + opening names), `models.py`, `analysis.py` (Stockfish eval + move classification), `jobs.py` (background analysis, one job per user), `patterns.py` (tactic tags from the position + opponent best reply), `stats.py` (pandas aggregation, study plan; moves DataFrame cached per user, keyed by analyzed-game count). Phase and tags are computed at query time, not stored.
- `backend/app/static/index.html`: a single-page dashboard (vanilla JS + Chart.js from a CDN) served at `/`. A Next.js frontend is optional future work.

## Conventions and gotchas
- Chess.com API: send a descriptive `User-Agent`, make requests one at a time (parallel calls get rate-limited), and cache monthly archives.
- Always store evals from the analyzed player's point of view: `score.pov(color).score(mate_score=10000)`.
- Classify moves by the drop in win probability (Lichess formula), not raw centipawn loss.
- Use fixed engine limits (depth or nodes) so analysis is reproducible. Depth comes from `ANALYSIS_DEPTH` in `.env` (default 12).
- There are no migrations: `create_all` won't add columns to existing tables. After a model change, stop uvicorn (it locks the file), delete `backend/chessiq.db`, then re-import and re-analyze.
