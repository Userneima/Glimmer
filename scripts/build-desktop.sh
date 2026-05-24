#!/usr/bin/env bash
# Build the signed Tauri desktop app with updater artifacts.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_SIGNING_KEY="${HOME}/.tauri/glimmer-updater.key"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

cd "$PROJECT_DIR"

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  export TAURI_SIGNING_PRIVATE_KEY_PATH="$DEFAULT_SIGNING_KEY"
fi

if [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ] && [ ! -f "$TAURI_SIGNING_PRIVATE_KEY_PATH" ]; then
  echo "Missing Tauri updater signing key: $TAURI_SIGNING_PRIVATE_KEY_PATH" >&2
  echo "Generate it with: npx tauri signer generate --ci -w \"$DEFAULT_SIGNING_KEY\"" >&2
  exit 1
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+x}" ]; then
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
fi

npx tauri build
