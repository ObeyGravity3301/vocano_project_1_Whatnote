@echo off
title WhatNote Step-by-Step Debug

echo.
echo ==========================================
echo    WhatNote Debug - Step by Step
echo ==========================================
echo.

echo Current directory: %CD%
echo.

echo STEP 1: Checking main.py...
if not exist "main.py" (
    echo ERROR: main.py not found
    pause
    exit /b 1
)
echo [OK] main.py found
echo Press any key to continue to step 2...
pause

echo.
echo STEP 2: Checking frontend directory...
if not exist "frontend" (
    echo ERROR: frontend directory not found
    pause
    exit /b 1
)
echo [OK] frontend directory found
echo Press any key to continue to step 3...
pause

echo.
echo STEP 3: Checking Node.js...
echo About to run: node --version
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH
    pause
    exit /b 1
)
echo [OK] Node.js found
echo Press any key to continue to step 4...
pause

echo.
echo STEP 4: Checking npm...
echo About to run: npm --version
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found in PATH
    echo This is where the problem might be!
    pause
    exit /b 1
)
echo [OK] npm found
echo Press any key to continue to step 5...
pause

echo.
echo STEP 5: Checking Python...
echo About to run: python --version
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo This is where the problem might be!
    pause
    exit /b 1
)
echo [OK] Python found
echo Press any key to continue to step 6...
pause

echo.
echo STEP 6: Checking pip...
echo About to run: pip --version
pip --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: pip not found
    echo This is where the problem might be!
    pause
    exit /b 1
)
echo [OK] pip found
echo Press any key to continue to step 7...
pause

echo.
echo STEP 7: Checking Python dependencies...
echo About to run: python -c "import fastapi"
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] FastAPI not found, need to install dependencies
    echo This is normal for first run
) else (
    echo [OK] Python dependencies found
)
echo Press any key to continue to step 8...
pause

echo.
echo STEP 8: Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo [WARNING] Frontend node_modules not found
    echo This is normal for first run
) else (
    echo [OK] Frontend dependencies found
)
echo Press any key to continue to final step...
pause

echo.
echo STEP 9: All checks completed!
echo If you see this message, all basic checks passed
echo The script should work normally now
echo.
pause 