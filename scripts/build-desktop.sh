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

# 额外参数原样传下去。本机只是想拿一个能打开的 App 时用：
#   npm run desktop:build -- --bundles app
# 这样会跳过做 .dmg 那一步——做 dmg 要挂载磁盘映像、再让 Finder 摆窗口，
# 屏幕上会弹出那个"拖进 Applications"的安装窗口，本地反复构建时很烦人。
# 正式发版不要加这个参数，安装包和更新用的产物都在 dmg 那一步里。
npx tauri build "$@"
