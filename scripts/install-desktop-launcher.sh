#!/usr/bin/env bash
# 在「桌面」安装 Glimmer 原生应用：双击即可打开 Tauri 桌面窗口。
# 用法：在仓库根目录执行 bash scripts/install-desktop-launcher.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP="${HOME}/Desktop"
APP_NAME="Glimmer.app"
SOURCE_APP="${PROJECT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}"
DEST_APP="${DESKTOP}/${APP_NAME}"

if ! command -v npm >/dev/null 2>&1; then
  echo "需要 npm 才能构建 Glimmer 桌面应用。当前环境未找到。" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "需要 Rust/Cargo 才能构建 Glimmer 桌面应用。当前环境未找到。" >&2
  exit 1
fi

cd "${PROJECT_DIR}"
npm run desktop:build

rm -rf "${DEST_APP}"
cp -R "${SOURCE_APP}" "${DEST_APP}"

echo "已创建：${DEST_APP}"
echo "双击后会打开原生 Tauri 桌面窗口，不再打开浏览器网页。"
echo "首次使用：若系统拦截，请在「系统设置 → 隐私与安全性」中允许运行，或右键 → 打开。"
