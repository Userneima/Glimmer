#!/usr/bin/env bash
# 在「桌面」生成「Glimmer」应用程序：双击即可启动开发服务并打开浏览器。
# 用法：在仓库根目录执行 bash scripts/install-desktop-launcher.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP="${HOME}/Desktop"
APP_NAME="Glimmer.app"
SOURCE_AS="${SCRIPT_DIR}/glimmer-launcher.applescript"
DEST_APP="${DESKTOP}/${APP_NAME}"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "需要 macOS 自带的 osacompile。当前环境未找到。" >&2
  exit 1
fi

rm -rf "${DEST_APP}"
osacompile -o "${DEST_APP}" "${SOURCE_AS}"

echo "已创建：${DEST_APP}"
echo "首次使用：若系统拦截，请在「系统设置 → 隐私与安全性」中允许运行，或右键 → 打开。"
