#!/usr/bin/env bash
# Start the diary-app dev server in background and open browser
# Safe to double-click via an AppleScript launcher or run manually.

set -e
PROJECT_DIR="/Users/yuchao/Desktop/diary-app-master"
LOGFILE="/tmp/diary-app-dev.log"
PORT="5177"

# Make sure common Node.js install locations are on PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Load nvm if available (so npm from nvm is available when using nvm)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

cd "$PROJECT_DIR"

# Ensure npm is available
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Please install Node.js (with npm) or adjust PATH in scripts/start-dev.sh." >>"$LOGFILE"
  open "$LOGFILE" || true
  exit 1
fi

# If server already listening on configured port, skip starting
if command -v nc >/dev/null 2>&1; then
  if nc -z localhost "$PORT" >/dev/null 2>&1; then
    echo "Dev server already running" >>"$LOGFILE"
  else
    nohup npm run dev >>"$LOGFILE" 2>&1 &
  fi
else
  # Fallback: try curl to check
  if curl -sI "http://localhost:$PORT" >/dev/null 2>&1; then
    echo "Dev server already running" >>"$LOGFILE"
  else
    nohup npm run dev >>"$LOGFILE" 2>&1 &
  fi
fi

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
  # Open the log so user can see the error
  open "$LOGFILE" || true
  exit 1
fi
