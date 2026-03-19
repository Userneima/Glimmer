@echo off
chcp 65001 >nul
title 日记应用 - Diary App

echo ========================================
echo    启动日记应用开发服务器
echo ========================================
echo.

cd /d "%~dp0"

echo 正在启动服务器...
echo.
echo 服务器启动后，浏览器会自动打开
echo 如果没有自动打开，请访问: http://localhost:5177
echo.
echo 按 Ctrl+C 可以停止服务器
echo ========================================
echo.

start http://localhost:5177

npm run dev

pause
