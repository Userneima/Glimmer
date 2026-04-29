#!/usr/bin/env bash
# Start Glimmer in the native Tauri desktop window.
# This is for the macOS desktop launcher, not for browser-based development.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGFILE="/tmp/glimmer-desktop.log"
PORT="5177"

# Make double-click launches work even when the shell profile is not loaded.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

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

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Please install Node.js or adjust PATH in scripts/start-desktop.sh." >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found in PATH. Please install Rust or adjust PATH in scripts/start-desktop.sh." >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
fi

kill_port "$PORT"

echo "$(date -Iseconds) Starting Glimmer desktop app with Tauri" >>"$LOGFILE"
npm run desktop:dev >>"$LOGFILE" 2>&1 || {
  echo "$(date -Iseconds) Failed to start Glimmer desktop app. See details above." >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
}
