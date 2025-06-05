@echo off
title WhatNote Quick Start

echo.
echo WhatNote Quick Start Script
echo Current directory: %CD%
echo.

:: Basic checks
if not exist "main.py" (
    echo ERROR: main.py not found
    echo Please run this script from the WhatNote project root directory
    pause
    exit /b 1
)

if not exist "frontend" (
    echo ERROR: frontend directory not found
    echo Please run this script from the WhatNote project root directory
    pause
    exit /b 1
)

:: Start backend service
echo Starting backend API server...
start "WhatNote Backend" cmd /k "echo Starting backend server... && python main.py || (echo ERROR: Failed to start backend && pause)"

:: Wait 3 seconds
echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

:: Start frontend service
echo Starting frontend React app...
start "WhatNote Frontend" cmd /k "echo Starting frontend app... && cd frontend && npm start || (echo ERROR: Failed to start frontend && pause)"

echo.
echo Services are starting...
echo    - Backend: http://127.0.0.1:8000
echo    - Frontend: http://localhost:3000
echo.
echo Two new windows should open for the services
echo If any service fails, check the respective window for error messages
echo.
pause 