@echo off
title WhatNote Launcher

echo.
echo ==========================================
echo    WhatNote Smart Learning Assistant
echo ==========================================
echo.

echo Current directory: %CD%
echo.

REM Check if main.py exists
if not exist "main.py" (
    echo ERROR: main.py not found in current directory
    echo Please run this script from the WhatNote project root directory
    echo.
    pause
    exit /b 1
)
echo [OK] main.py found

REM Check frontend directory
if not exist "frontend" (
    echo ERROR: frontend directory not found
    echo Please run this script from the WhatNote project root directory  
    echo.
    pause
    exit /b 1
)
echo [OK] frontend directory found

echo.
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found

echo.
echo Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found in PATH
    echo Please install Node.js which includes npm
    echo.
    pause
    exit /b 1
)
echo [OK] npm found

echo.
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo Please install Python 3.8+ from https://python.org/
    echo Make sure to add Python to PATH during installation
    echo.
    pause
    exit /b 1
)
echo [OK] Python found

echo.
echo Checking pip...
pip --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: pip not found
    echo Please reinstall Python with pip included
    echo.
    pause
    exit /b 1
)
echo [OK] pip found

echo.
echo Creating necessary directories...
if not exist "uploads" mkdir uploads
if not exist "pages" mkdir pages
if not exist "logs" mkdir logs
if not exist "llm_logs" mkdir llm_logs
if not exist "board_logs" mkdir board_logs

echo.
echo Starting services...
echo.

REM Start backend service
echo Starting backend API server...
start "WhatNote Backend" cmd /k "python main.py"

REM Wait for backend
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend service
echo Starting frontend React app...
start "WhatNote Frontend" cmd /k "cd frontend && npm start"

echo.
echo Services are starting...
echo Backend: http://127.0.0.1:8000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this launcher...
pause 