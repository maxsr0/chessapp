FROM python:3.12-slim

# Official Stockfish builds are much faster than Debian's generic package. At startup the CMD
# links the AVX2 build when the host CPU supports it, otherwise the SSE4.1 one.
ARG SF_VERSION=sf_17.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && for a in avx2 sse41-popcnt; do \
         curl -fsSL "https://github.com/official-stockfish/Stockfish/releases/download/${SF_VERSION}/stockfish-ubuntu-x86-64-$a.tar" | tar -x -C /tmp \
         && install -m 755 "/tmp/stockfish/stockfish-ubuntu-x86-64-$a" "/usr/local/bin/stockfish-$a" \
         && rm -rf /tmp/stockfish; \
       done \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV STOCKFISH_PATH=/usr/local/bin/stockfish \
    ANALYSIS_DEPTH=10 \
    ANALYSIS_WORKERS=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render sets $PORT. Migrations run on startup (see app.main lifespan).
# --proxy-headers: trust Render's X-Forwarded-For so rate limits apply per visitor, not per proxy
CMD ["sh", "-c", "if grep -qw avx2 /proc/cpuinfo; then b=avx2; else b=sse41-popcnt; fi; ln -sf /usr/local/bin/stockfish-$b /usr/local/bin/stockfish && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
