@echo off
title WhatNote Main Launcher

echo.
echo ==========================================
echo    WhatNote Smart Learning Assistant
echo    Separated Launch System
echo ==========================================
echo.

echo Current directory: %CD%
echo.

REM Basic checks
if not exist "main.py" (
    echo ERROR: main.py not found in current directory
    echo Please run this script from the WhatNote project root directory
    echo.
    pause
    exit /b 1
)

if not exist "frontend" (
    echo ERROR: frontend directory not found
    echo Please run this script from the WhatNote project root directory
    echo.
    pause
    exit /b 1
)

if not exist "启动后端.bat" (
    echo ERROR: 启动后端.bat not found
    echo Please make sure all launcher scripts are present
    echo.
    pause
    exit /b 1
)

if not exist "启动前端.bat" (
    echo ERROR: 启动前端.bat not found
    echo Please make sure all launcher scripts are present
    echo.
    pause
    exit /b 1
)

echo [OK] All required files found
echo.

echo ==========================================
echo    Launch Options
echo ==========================================
echo.
echo 1. Start both backend and frontend (recommended)
echo 2. Start backend only
echo 3. Start frontend only
echo 4. Exit
echo.
set /p choice="Please choose an option (1-4): "

if "%choice%"=="1" goto start_both
if "%choice%"=="2" goto start_backend
if "%choice%"=="3" goto start_frontend
if "%choice%"=="4" goto exit
echo Invalid choice, defaulting to option 1...

:start_both
echo.
echo Starting both backend and frontend...
echo.
echo Starting backend server in new window...
start "WhatNote Backend" "启动后端.bat"
echo Waiting 3 seconds for backend to initialize...
timeout /t 3 /nobreak >nul
echo.
echo Starting frontend server in new window...
start "WhatNote Frontend" "启动前端.bat"
echo.
echo ==========================================
echo    Services Starting
echo ==========================================
echo.
echo Backend server: http://127.0.0.1:8000
echo Frontend app:   http://localhost:3000
echo API docs:       http://127.0.0.1:8000/docs
echo.
echo Two new windows should have opened
echo Wait for both services to fully start (may take 1-2 minutes)
echo The browser should open automatically when frontend is ready
echo.
goto end

:start_backend
echo.
echo Starting backend only...
start "WhatNote Backend" "启动后端.bat"
echo Backend server is starting in a new window
goto end

:start_frontend
echo.
echo Starting frontend only...
start "WhatNote Frontend" "启动前端.bat"
echo Frontend server is starting in a new window
goto end

:end
echo Press any key to exit this launcher...
pause
goto exit

:exit
exit 