@echo off
title WhatNote Backend Server

echo.
echo ==========================================
echo    WhatNote Backend Server
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
echo Checking Python dependencies...
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing Python dependencies...
    echo This may take a few minutes...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install Python dependencies
        echo Please check your internet connection and try again
        echo.
        pause
        exit /b 1
    )
    echo [OK] Python dependencies installed successfully
) else (
    echo [OK] Python dependencies ready
)

echo.
echo Creating necessary directories...
if not exist "uploads" mkdir uploads
if not exist "pages" mkdir pages
if not exist "logs" mkdir logs
if not exist "llm_logs" mkdir llm_logs
if not exist "board_logs" mkdir board_logs

echo.
echo Creating configuration file...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    ) else (
        echo QWEN_API_KEY=your_qwen_api_key_here > .env
        echo QWEN_VL_API_KEY=your_qwen_vl_api_key_here >> .env
    )
    echo [INFO] Created .env file - please edit it and add your API keys
)

echo.
echo ==========================================
echo    Starting Backend Server
echo ==========================================
echo.

echo Starting Python backend server...
echo Backend will be available at: http://127.0.0.1:8000
echo API documentation: http://127.0.0.1:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py

echo.
echo Backend server stopped.
pause 