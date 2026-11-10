FROM python:3.12-slim

# Debian's Stockfish package lands in /usr/games
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

ENV STOCKFISH_PATH=/usr/games/stockfish \
    ANALYSIS_DEPTH=10 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render sets $PORT. Migrations run on startup (see app.main lifespan).
# --proxy-headers: trust Render's X-Forwarded-For so rate limits apply per visitor, not per proxy
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
