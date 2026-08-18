#!/usr/bin/env bash
# Stop this pilot only: Docker db/web/worker + host llama-server.
# Does not touch mapvideo, nginx, or the Postgres volume.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Останавливаю контейнеры db / web / worker…"
docker compose stop db web worker

"$ROOT/scripts/llama-tmux.sh" stop

pkill -f "next dev --turbopack -p 3010" 2>/dev/null || true
pkill -f "tsx src/worker/index.ts" 2>/dev/null || true

echo "Пилот выключен. Письма в томе БД на месте. Mapvideo и nginx не трогал."
echo "Включение: ./scripts/up.sh"
