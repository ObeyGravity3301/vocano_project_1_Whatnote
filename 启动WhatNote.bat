@echo off
title WhatNote Launcher

echo.
echo ========================================
echo    WhatNote Smart Learning Assistant
echo ========================================
echo.

:: Check current working directory
echo Current directory: %CD%
echo.

:: Check if main.py exists
if not exist "main.py" (
    echo ERROR: main.py not found in current directory
    echo Please run this script from the WhatNote project root directory
    echo.
    pause
    exit /b 1
)

:: Check Node.js installation
echo Checking Node.js...
node --version 2>nul
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
) else (
    echo Node.js found: 
    node --version
)

:: Check npm installation
echo Checking npm...
npm --version 2>nul
if errorlevel 1 (
    echo ERROR: npm not found in PATH
    echo Please install Node.js which includes npm
    echo.
    pause
    exit /b 1
) else (
    echo npm found:
    npm --version
)

:: Check Python installation
echo Checking Python...
python --version 2>nul
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo Please install Python 3.8+ from https://python.org/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
) else (
    echo Python found:
    python --version
)

:: Check pip installation
echo Checking pip...
pip --version 2>nul
if errorlevel 1 (
    echo ERROR: pip not found
    echo Please reinstall Python with pip included
    echo.
    pause
    exit /b 1
) else (
    echo pip found:
    pip --version
)

echo.
echo All required tools found!
echo.

:: Check frontend directory
if not exist "frontend" (
    echo ERROR: frontend directory not found
    echo Please make sure you are in the correct WhatNote project directory
    echo.
    pause
    exit /b 1
)

:: Check Python dependencies
echo Checking Python dependencies...
python -c "import fastapi" 2>nul
if errorlevel 1 (
    echo Installing Python dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install Python dependencies
        echo Please check your internet connection and try again
        echo Or run manually: pip install -r requirements.txt
        echo.
        pause
        exit /b 1
    )
)

:: Check frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    echo This may take a few minutes...
    cd frontend
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        echo Please check your internet connection and try again
        echo Or run manually: cd frontend && npm install
        echo.
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo Frontend dependencies installed successfully!
)

:: Check .env file
if not exist ".env" (
    echo Creating .env configuration file...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    ) else (
        echo # WhatNote Configuration > .env
        echo QWEN_API_KEY=your_qwen_api_key_here >> .env
        echo QWEN_VL_API_KEY=your_qwen_vl_api_key_here >> .env
    )
    echo Please edit .env file and set your API keys
    echo.
)

:: Create necessary directories
if not exist "uploads" mkdir uploads
if not exist "pages" mkdir pages
if not exist "logs" mkdir logs
if not exist "llm_logs" mkdir llm_logs
if not exist "board_logs" mkdir board_logs

echo.
echo Environment setup completed successfully!
echo.

:: Start services
echo Starting WhatNote services...
echo.
echo Service URLs:
echo    Frontend React App: http://localhost:3000
echo    Backend API Server: http://127.0.0.1:8000
echo    API Documentation: http://127.0.0.1:8000/docs
echo.

:: Start backend service in new window
echo Starting backend API server...
start "WhatNote Backend" cmd /k "echo Starting backend... && python main.py && echo Backend stopped && pause"

:: Wait for backend to start
echo Waiting for backend service to start...
timeout /t 3 /nobreak >nul

:: Start frontend service in new window
echo Starting frontend React app...
start "WhatNote Frontend" cmd /k "echo Starting frontend... && cd frontend && npm start && echo Frontend stopped && pause"

:: Wait and open browser
echo Waiting for services to initialize...
timeout /t 8 /nobreak >nul
echo Opening browser...
start "" "http://localhost:3000"

echo.
echo WhatNote services started successfully!
echo.
echo Service Status:
echo    - Frontend: http://localhost:3000 (React Development Server)
echo    - Backend: http://127.0.0.1:8000 (FastAPI Server)
echo.
echo Two new windows should have opened for frontend and backend services
echo If any service fails to start, check the respective window for error messages
echo.
echo Press any key to exit this launcher...
pause 