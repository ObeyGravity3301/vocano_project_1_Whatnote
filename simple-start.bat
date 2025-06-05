@echo off
title WhatNote Simple Launcher

echo Starting WhatNote...
echo.

echo Step 1: Check files
if not exist "main.py" (
    echo ERROR: main.py not found
    echo Please run this script from the WhatNote project root
    pause
    exit /b 1
)
echo main.py found

if not exist "frontend" (
    echo ERROR: frontend folder not found
    echo Please run this script from the WhatNote project root
    pause
    exit /b 1
)
echo frontend folder found

echo.
echo Step 2: Start backend
echo Starting Python backend...
start "Backend" cmd /k "python main.py"

echo.
echo Step 3: Wait and start frontend
echo Waiting 5 seconds...
timeout /t 5 /nobreak

echo Starting React frontend...
start "Frontend" cmd /k "cd frontend && npm start"

echo.
echo Services should be starting...
echo Backend: http://127.0.0.1:8000
echo Frontend: http://localhost:3000
echo.
pause 