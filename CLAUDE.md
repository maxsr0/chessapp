# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
ChessIQ: enter a Chess.com username, import games via the public API, analyze every move with Stockfish, and surface patterns (weak openings, recurring mistakes, trends over time). The owner is using it to learn Claude Code, Python APIs, and data analysis. Build milestone by milestone, testing each before moving on. The current plan (v2: a public app at maxwellrobbins.com/chessapp) is in `C:\Users\maxwell.robbins\.claude\plans\steady-wondering-minsky.md`.

Deployment target: the backend runs as a Docker image on Render's free tier (`render.yaml`, `backend/Dockerfile`) with Neon Postgres. The frontend will be a Next.js static export (`basePath: /chessapp`) on GitHub Pages.

## Commands (run from `backend/`)
- Install: `python -m venv .venv` then `.venv/Scripts/python -m pip install -r requirements.txt`
- Dev server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (API docs at http://127.0.0.1:8000/docs)
- Tests: `.venv/Scripts/python -m pytest -q`; one test: `.venv/Scripts/python -m pytest tests/test_jobs.py::test_enqueue_and_queue_position`
- New migration after a model change: `.venv/Scripts/alembic revision --autogenerate -m "describe change"`, then review the file in `migrations/versions/`. Migrations run automatically at app startup (`run_migrations()` in the lifespan).
- Stockfish: set `STOCKFISH_PATH` in `backend/.env` (see `.env.example`) or put `stockfish` on PATH.

## Architecture
- `backend/app/`: FastAPI + SQLModel + python-chess. Modules:
  - `chesscom.py`: API client and opening names.
  - `models.py`
  - `analysis.py`: Stockfish eval and move classification.
  - `jobs.py`: **one global worker thread** with one Stockfish process. It works through `Game.analysis_status == "queued"` oldest-first (by `queued_at`), across all users. Queued games survive restarts.
  - `patterns.py`: tactic tags, from the position plus the opponent's best reply.
  - `stats.py`: pandas aggregation and the study plan. The moves DataFrame is cached per user, keyed by analyzed-game count. Phase and tags are computed at query time, not stored.
- `POST /players/{u}/sync` = import + enqueue. Import is capped by `MAX_IMPORT` (default 100). It's rate-limited per IP with `slowapi`, and CORS comes from `ALLOWED_ORIGINS`.
- `backend/app/static/index.html`: the legacy vanilla-JS dashboard at `/`, kept until the Next.js `frontend/` replaces it.

## Conventions and gotchas
- Config comes from env vars, which `.env` loads locally: `DATABASE_URL` (SQLite by default; `postgres://` URLs are rewritten to `postgresql+psycopg://`), `STOCKFISH_PATH`, `ANALYSIS_DEPTH` (12 locally, 10 in Docker), `MAX_IMPORT`, `ALLOWED_ORIGINS`, and `RUN_WORKER` (set to `0` to skip the worker; the tests do this).
- Tests use a temp SQLite DB set up in `tests/conftest.py`. Env vars must be set before `app` is imported.
- Chess.com API: send a descriptive `User-Agent` and make requests one at a time (parallel calls get rate-limited).
- `MoveAnalysis.eval_before/eval_after` are from the *mover's* point of view (`score.pov(board.turn).score(mate_score=10000)`; mate in N = ±(10000−N)). Use `is_player` to select the analyzed player's moves; for a White-POV graph, negate Black's moves.
- Classify moves by the drop in win probability (Lichess formula), not raw centipawn loss. Use fixed engine limits so analysis is reproducible.
- Alembic uses `render_as_batch=True`, because SQLite can't ALTER columns.
