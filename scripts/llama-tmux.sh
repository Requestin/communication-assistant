#!/usr/bin/env bash
# llama-server in a dedicated tmux session. Does not touch other tmux sessions
# (for example wan22_*) or mapvideo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_BIN="/root/local_llm/llama.cpp/build/bin/llama-server"
LLAMA_LIB="/root/local_llm/llama.cpp/build/bin"
SESSION="commassist-llm"
LOG_DIR="$ROOT/logs"
LLAMA_LOG="$LOG_DIR/llama-server.log"
LLAMA_PID="$LOG_DIR/llama-server.pid"

mkdir -p "$LOG_DIR"

gguf_path() {
  if [[ ! -f "$ROOT/.env" ]]; then
    echo "Нет .env — скопируйте .env.example и заполните секреты." >&2
    return 1
  fi
  grep -E '^LLM_GGUF_PATH=' "$ROOT/.env" | tail -n1 | cut -d= -f2-
}

llama_pids() {
  pgrep -f "^${LLAMA_BIN} " || true
}

port_8088_busy() {
  ss -tlnH | grep -qE "127\\.0\\.0\\.1:8088[[:space:]]"
}

wait_port_free() {
  local i
  for i in $(seq 1 45); do
    if [[ -z "$(llama_pids)" ]] && ! port_8088_busy; then
      return 0
    fi
    sleep 1
  done
  echo "Порт 127.0.0.1:8088 всё ещё занят после остановки llama-server." >&2
  return 1
}

cmd_stop() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Останавливаю tmux-сессию $SESSION…"
    tmux kill-session -t "$SESSION" || true
  fi
  local pids
  pids="$(llama_pids)"
  if [[ -n "$pids" ]]; then
    echo "Останавливаю llama-server…"
    # pids are ours only: command line starts with the binary path.
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(llama_pids)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
  rm -f "$LLAMA_PID"
  wait_port_free || true
}

cmd_start() {
  if ! command -v tmux >/dev/null; then
    echo "Не найден tmux — поставьте пакет tmux." >&2
    exit 1
  fi

  local pids
  pids="$(llama_pids)"
  if [[ -n "$pids" ]] && tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "llama-server уже в tmux-сессии $SESSION."
    return 0
  fi

  if [[ -n "$pids" ]]; then
    echo "llama-server работает вне tmux — перезапускаю в сессии $SESSION."
    cmd_stop
  elif tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION" || true
  fi

  local model
  model="$(gguf_path)"
  if [[ -z "$model" || ! -f "$model" ]]; then
    echo "Не найден файл модели LLM_GGUF_PATH." >&2
    exit 1
  fi

  echo "Запускаю llama-server в tmux ($SESSION). Первый раз долго — модель в GPU."
  local inner
  inner="$(cat <<EOF
export LD_LIBRARY_PATH=$(printf %q "$LLAMA_LIB"):\"\${LD_LIBRARY_PATH:-}\"
exec > >(tee -a $(printf %q "$LLAMA_LOG")) 2>&1
exec $(printf %q "$LLAMA_BIN") --model $(printf %q "$model") --host 127.0.0.1 --port 8088 --ctx-size 8192 -ngl 99 --alias qwen36 --reasoning off
EOF
)"
  tmux new-session -d -s "$SESSION" -n llama "bash --noprofile --norc -c $(printf %q "$inner")"
  tmux set-option -t "$SESSION" history-limit 20000 >/dev/null
  tmux set-option -t "$SESSION" remain-on-exit on >/dev/null
  sleep 1
  pids="$(llama_pids)"
  if [[ -n "$pids" ]]; then
    echo "$pids" | head -n1 >"$LLAMA_PID"
  fi
  echo "Логи: tmux attach -t $SESSION   (отцепиться: Ctrl-b, затем d)"
}

cmd_attach() {
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Сессии $SESSION нет. Сначала ./scripts/up.sh или $0 start" >&2
    exit 1
  fi
  exec tmux attach -t "$SESSION"
}

usage() {
  echo "usage: $0 start|stop|attach" >&2
  exit 2
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  attach) cmd_attach ;;
  *) usage ;;
esac
