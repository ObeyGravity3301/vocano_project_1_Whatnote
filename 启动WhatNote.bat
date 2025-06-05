@echo off
title WhatNote Launcher

echo.
echo ========================================
echo    WhatNote Smart Learning Assistant
echo ========================================
echo.

:: Check Node.js installation
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js not found, please install Node.js first
    pause
    exit /b 1
)

:: Check npm installation
npm --version >nul 2>&1
if errorlevel 1 (
    echo Error: npm not found, please install Node.js and npm first
    pause
    exit /b 1
)

:: Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found, please install Python 3.8+
    pause
    exit /b 1
)

:: Check Python dependencies
echo Checking Python dependencies...
python -c "import fastapi, openai, fitz" >nul 2>&1
if errorlevel 1 (
    echo Installing Python dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo Failed to install dependencies, please run manually: pip install -r requirements.txt
        pause
        exit /b 1
    )
)

:: Check frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    npm install
    if errorlevel 1 (
        echo Failed to install frontend dependencies, please run manually: cd frontend && npm install
        pause
        exit /b 1
    )
    cd ..
)

:: Check .env file
if not exist ".env" (
    echo Creating .env configuration file...
    copy ".env.example" ".env" >nul 2>&1
    echo Please edit .env file and set your API keys:
    echo    QWEN_API_KEY=your_qwen_api_key
    echo    QWEN_VL_API_KEY=your_qwen_vl_api_key
    echo.
    echo Press any key to continue...
    pause >nul
)

:: Create necessary directories
if not exist "uploads" mkdir uploads
if not exist "pages" mkdir pages
if not exist "logs" mkdir logs
if not exist "llm_logs" mkdir llm_logs
if not exist "board_logs" mkdir board_logs

echo Environment check completed
echo.

:: Start services
echo Starting WhatNote services...
echo.
echo Service URLs:
echo    Frontend React App: http://localhost:3000
echo    Backend API Server: http://127.0.0.1:8000
echo    API Documentation: http://127.0.0.1:8000/docs
echo.
echo Tips:
echo    - Frontend and backend will start in parallel
echo    - Press Ctrl+C to stop any service
echo    - Browser will open automatically
echo    - Check console output for any issues
echo.

:: Start backend service in new window
echo Starting backend API server...
start "WhatNote Backend" cmd /c "python main.py & pause"

:: Wait for backend to start
echo Waiting for backend service to start...
timeout /t 5 /nobreak >nul

:: Start frontend service in new window
echo Starting frontend React app...
start "WhatNote Frontend" cmd /c "cd frontend && npm start & pause"

:: Open browser after delay
echo Preparing to open browser...
timeout /t 10 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo WhatNote services started successfully!
echo.
echo Service Status:
echo    - Frontend: http://localhost:3000 (React Development Server)
echo    - Backend: http://127.0.0.1:8000 (FastAPI Server)
echo.
echo To restart services, close the respective windows and run this script again
echo.
pause 