@echo off
title WhatNote Launcher - Debug Mode

echo.
echo ========================================
echo    WhatNote Smart Learning Assistant
echo    Debug Mode - Detailed Output
echo ========================================
echo.
echo Debug Info:
echo Script Location: %~dp0
echo Current Directory: %CD%
echo Date/Time: %DATE% %TIME%
echo.

:: Enable command echoing for debugging
echo === STEP 1: Directory Check ===
echo.

:: Check if main.py exists
echo Checking for main.py...
if exist "main.py" (
    echo [OK] main.py found
) else (
    echo [ERROR] main.py not found in current directory
    echo Current directory contents:
    dir /b
    echo.
    echo Please run this script from the WhatNote project root directory
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: Check frontend directory
echo Checking for frontend directory...
if exist "frontend" (
    echo [OK] frontend directory found
) else (
    echo [ERROR] frontend directory not found
    echo Current directory contents:
    dir /b
    echo.
    echo Please make sure you are in the correct WhatNote project directory
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo.
echo === STEP 2: Node.js Check ===
echo.

:: Check Node.js installation
echo Testing Node.js command...
node --version >nul 2>&1
set NODE_EXIT_CODE=%ERRORLEVEL%
echo Node.js command exit code: %NODE_EXIT_CODE%

if %NODE_EXIT_CODE% NEQ 0 (
    echo [ERROR] Node.js not found in PATH
    echo Please install Node.js from https://nodejs.org/
    echo Make sure to restart your command prompt after installation
    echo.
    echo Current PATH:
    echo %PATH%
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
) else (
    echo [OK] Node.js found:
    node --version
)

echo.
echo === STEP 3: npm Check ===
echo.

:: Check npm installation
echo Testing npm command...
npm --version >nul 2>&1
set NPM_EXIT_CODE=%ERRORLEVEL%
echo npm command exit code: %NPM_EXIT_CODE%

if %NPM_EXIT_CODE% NEQ 0 (
    echo [ERROR] npm not found in PATH
    echo npm should be included with Node.js installation
    echo Please reinstall Node.js or add npm to PATH
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
) else (
    echo [OK] npm found:
    npm --version
)

echo.
echo === STEP 4: Python Check ===
echo.

:: Check Python installation
echo Testing Python command...
python --version >nul 2>&1
set PYTHON_EXIT_CODE=%ERRORLEVEL%
echo Python command exit code: %PYTHON_EXIT_CODE%

if %PYTHON_EXIT_CODE% NEQ 0 (
    echo [ERROR] Python not found in PATH
    echo Please install Python 3.8+ from https://python.org/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    echo Trying alternative python3 command...
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo python3 command also failed
    ) else (
        echo python3 found:
        python3 --version
        echo You may need to use 'python3' instead of 'python'
    )
    echo.
    echo Current PATH:
    echo %PATH%
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
) else (
    echo [OK] Python found:
    python --version
)

echo.
echo === STEP 5: pip Check ===
echo.

:: Check pip installation
echo Testing pip command...
pip --version >nul 2>&1
set PIP_EXIT_CODE=%ERRORLEVEL%
echo pip command exit code: %PIP_EXIT_CODE%

if %PIP_EXIT_CODE% NEQ 0 (
    echo [ERROR] pip not found
    echo Trying alternative pip3 command...
    pip3 --version >nul 2>&1
    if errorlevel 1 (
        echo pip3 command also failed
        echo Please reinstall Python with pip included
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    ) else (
        echo [OK] pip3 found:
        pip3 --version
        echo Note: You may need to use 'pip3' instead of 'pip'
    )
) else (
    echo [OK] pip found:
    pip --version
)

echo.
echo === STEP 6: Dependencies Check ===
echo.

:: Check Python dependencies
echo Checking Python dependencies...
echo Testing fastapi import...
python -c "import fastapi; print('FastAPI version:', fastapi.__version__)" 2>nul
if errorlevel 1 (
    echo [WARNING] FastAPI not found, will install dependencies...
    echo.
    echo Installing Python dependencies...
    echo Command: pip install -r requirements.txt
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install Python dependencies
        echo Please check your internet connection and try again
        echo Or run manually: pip install -r requirements.txt
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
    echo [OK] Python dependencies installed successfully
) else (
    echo [OK] Python dependencies found
)

:: Check frontend dependencies
echo.
echo Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo [WARNING] Frontend node_modules not found, will install...
    echo.
    echo Installing frontend dependencies...
    echo This may take a few minutes...
    echo Command: cd frontend && npm install
    cd frontend
    npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies
        echo Please check your internet connection and try again
        echo Or run manually: cd frontend && npm install
        echo.
        cd ..
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
    cd ..
    echo [OK] Frontend dependencies installed successfully
) else (
    echo [OK] Frontend dependencies found
)

echo.
echo === STEP 7: Configuration Setup ===
echo.

:: Check .env file
if not exist ".env" (
    echo [INFO] Creating .env configuration file...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] Copied .env.example to .env
    ) else (
        echo # WhatNote Configuration > .env
        echo QWEN_API_KEY=your_qwen_api_key_here >> .env
        echo QWEN_VL_API_KEY=your_qwen_vl_api_key_here >> .env
        echo [OK] Created default .env file
    )
    echo [INFO] Please edit .env file and set your API keys
) else (
    echo [OK] .env file exists
)

:: Create necessary directories
echo.
echo Creating necessary directories...
if not exist "uploads" (mkdir uploads && echo [OK] Created uploads directory)
if not exist "pages" (mkdir pages && echo [OK] Created pages directory)
if not exist "logs" (mkdir logs && echo [OK] Created logs directory)
if not exist "llm_logs" (mkdir llm_logs && echo [OK] Created llm_logs directory)
if not exist "board_logs" (mkdir board_logs && echo [OK] Created board_logs directory)

echo.
echo === STEP 8: Environment Ready ===
echo.
echo [SUCCESS] All environment checks passed!
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
echo [INFO] Starting backend API server...
start "WhatNote Backend" cmd /k "echo === WhatNote Backend === && echo Starting backend server... && python main.py || (echo === BACKEND ERROR === && echo Backend failed to start && pause)"

:: Wait for backend to start
echo [INFO] Waiting for backend service to start...
timeout /t 3 /nobreak >nul

:: Start frontend service in new window
echo [INFO] Starting frontend React app...
start "WhatNote Frontend" cmd /k "echo === WhatNote Frontend === && echo Starting frontend app... && cd frontend && npm start || (echo === FRONTEND ERROR === && echo Frontend failed to start && pause)"

:: Wait and open browser
echo [INFO] Waiting for services to initialize...
timeout /t 8 /nobreak >nul
echo [INFO] Opening browser...
start "" "http://localhost:3000"

echo.
echo ========================================
echo  WhatNote Services Launch Complete!
echo ========================================
echo.
echo Service Status:
echo    - Frontend: http://localhost:3000 (React Development Server)
echo    - Backend: http://127.0.0.1:8000 (FastAPI Server)
echo.
echo Two new windows should have opened for frontend and backend services
echo If any service fails to start, check the respective window for error messages
echo.
echo This launcher window will remain open for debugging
echo Press any key to exit this launcher...
pause 