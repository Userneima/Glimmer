#!/usr/bin/env bash
# 在「桌面」安装 Glimmer Web 本地启动器：双击即可启动 Vite 并打开浏览器。
# 用法：在仓库根目录执行 bash scripts/install-web-launcher.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP="${HOME}/Desktop"
APP_NAME="Glimmer Web.app"
SOURCE_SCRIPT="${PROJECT_DIR}/scripts/glimmer-web-launcher.applescript"
DEST_APP="${DESKTOP}/${APP_NAME}"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "当前系统缺少 osacompile，无法创建 macOS 应用启动器。" >&2
  exit 1
fi

rm -rf "${DEST_APP}"
osacompile -o "${DEST_APP}" "${SOURCE_SCRIPT}"

echo "已创建：${DEST_APP}"
echo "双击后会启动本地 Web 版，并自动打开 http://localhost:5177。"
