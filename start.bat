@echo off
title WhatNote Quick Start

echo.
echo WhatNote Quick Start Script
echo.

:: Start backend service
echo Starting backend API server...
start "WhatNote Backend" cmd /k "python main.py"

:: Wait 3 seconds
timeout /t 3 /nobreak >nul

:: Start frontend service
echo Starting frontend React app...
start "WhatNote Frontend" cmd /k "cd frontend && npm start"

echo.
echo Services started successfully!
echo    - Backend: http://127.0.0.1:8000
echo    - Frontend: http://localhost:3000
echo.
pause 