#!/usr/bin/env bash
# Start this pilot only: host llama-server + Docker db/web/worker.
# Does not touch mapvideo, nginx, or ports 3000/5432.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Нет .env — скопируйте .env.example и заполните секреты." >&2
  exit 1
fi

stop_host_node() {
  pkill -f "next dev --turbopack -p 3010" 2>/dev/null || true
  pkill -f "tsx src/worker/index.ts" 2>/dev/null || true
  sleep 1
}

start_llama() {
  "$ROOT/scripts/llama-tmux.sh" start
}

wait_llama() {
  echo "Жду модель на 127.0.0.1:8088…"
  local i
  for i in $(seq 1 180); do
    if curl -sf "http://127.0.0.1:8088/health" >/dev/null \
      || curl -sf "http://127.0.0.1:8088/v1/models" >/dev/null; then
      echo "Модель отвечает."
      return
    fi
    sleep 2
  done
  echo "Модель не ответила за 6 минут. tmux attach -t commassist-llm" >&2
  exit 1
}

wait_web() {
  echo "Жду сайт на 127.0.0.1:3010…"
  local i
  for i in $(seq 1 90); do
    if curl -sf -o /dev/null "http://127.0.0.1:3010/"; then
      echo "Сайт отвечает."
      return
    fi
    sleep 2
  done
  echo "Сайт не ответил за 3 минуты. docker compose logs web" >&2
  exit 1
}

BUILD=0
if [[ "${1:-}" == "--build" ]]; then
  BUILD=1
fi

start_llama
wait_llama

if [[ "$BUILD" -eq 1 ]]; then
  echo "Собираю образы web и worker (без llm)…"
  docker compose build web worker
fi

stop_host_node

echo "Поднимаю db, web, worker (без контейнера llm)…"
docker compose up -d db web worker
wait_web

echo "Готово: https://assistant.gyhyry.com  и  http://127.0.0.1:3010"
echo "Модель в tmux: tmux attach -t commassist-llm  (Ctrl-b d — отцепиться)"
echo "Выключение: ./scripts/down.sh"
