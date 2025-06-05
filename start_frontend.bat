@echo off
title WhatNote Frontend Server

echo.
echo ==========================================
echo    WhatNote Frontend Server
echo ==========================================
echo.

echo Current directory: %CD%
echo.

REM Check if frontend directory exists
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
    echo If Node.js is installed, try:
    echo 1. Restarting your command prompt
    echo 2. Adding Node.js to your PATH manually
    echo 3. Reinstalling Node.js with PATH option checked
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found

echo.
echo Entering frontend directory...
cd frontend

echo.
echo Checking frontend dependencies...
if not exist "node_modules" (
    echo [INFO] Installing frontend dependencies...
    echo This may take several minutes...
    echo.
    echo Running: npm install
    npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install frontend dependencies
        echo.
        echo Possible solutions:
        echo 1. Check your internet connection
        echo 2. Clear npm cache: npm cache clean --force
        echo 3. Delete node_modules folder and try again
        echo 4. Use yarn instead: yarn install
        echo.
        pause
        cd ..
        exit /b 1
    )
    echo [OK] Frontend dependencies installed successfully
) else (
    echo [OK] Frontend dependencies ready
)

echo.
echo ==========================================
echo    Starting Frontend Server
echo ==========================================
echo.

echo Starting React development server...
echo Frontend will be available at: http://localhost:3000
echo.
echo The browser should open automatically
echo Press Ctrl+C to stop the server
echo.

npm start

echo.
echo Frontend server stopped.
cd ..
pause 