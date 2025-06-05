@echo off
chcp 65001 >nul
title WhatNote 快速启动

echo.
echo 🚀 WhatNote 快速启动脚本
echo.

:: 启动后端服务
echo 🔧 启动后端API服务...
start "WhatNote Backend" cmd /k "python main.py"

:: 等待3秒
timeout /t 3 /nobreak >nul

:: 启动前端服务
echo 🎨 启动前端React应用...
start "WhatNote Frontend" cmd /k "cd frontend && npm start"

echo.
echo ✅ 服务启动完成！
echo    - 后端：http://127.0.0.1:8000
echo    - 前端：http://localhost:3000
echo.
pause 