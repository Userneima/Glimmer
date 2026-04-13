#!/usr/bin/env bash
# Start the Glimmer dev server in background and open browser.
# Double-click safe: if something is already listening on the dev port(s), it is stopped first (fresh restart).

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGFILE="/tmp/glimmer-dev.log"
PORT="5177"

# Optional: space-separated extra ports to free before start (e.g. "3000 8080" for a local API).
# Default empty — this repo only runs Vite on PORT.
BACKEND_PORTS="${BACKEND_PORTS:-}"

# Make sure common Node.js install locations are on PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Load nvm if available (so npm from nvm is available when using nvm)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

cd "$PROJECT_DIR"

kill_port() {
  local p="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$(date -Iseconds) Stopping process(es) on port $p: $pids" >>"$LOGFILE"
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

# Restart semantics: always clear configured ports, then start Vite
kill_port "$PORT"
for bp in $BACKEND_PORTS; do
  kill_port "$bp"
done

# Ensure npm is available
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Please install Node.js (with npm) or adjust PATH in scripts/start-dev.sh." >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
fi

echo "$(date -Iseconds) Starting Vite (npm run dev) on port $PORT" >>"$LOGFILE"
nohup npm run dev >>"$LOGFILE" 2>&1 &

# Wait until server is reachable (up to ~15s)
for i in {1..30}; do
  if curl -sI "http://localhost:$PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if curl -sI "http://localhost:$PORT" >/dev/null 2>&1; then
  open "http://localhost:$PORT"
else
  echo "Failed to start dev server on port $PORT. See $LOGFILE" >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
fi
