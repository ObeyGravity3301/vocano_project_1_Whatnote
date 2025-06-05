@echo off
title Test npm Commands

echo Testing npm commands step by step...
echo.

echo Test 1: npm without parameters
npm
echo npm command completed with exit code: %ERRORLEVEL%
echo.
pause

echo Test 2: npm --version (with output)
npm --version
echo npm --version completed with exit code: %ERRORLEVEL%
echo.
pause

echo Test 3: npm --version (hidden output)
npm --version >nul 2>&1
echo npm --version (hidden) completed with exit code: %ERRORLEVEL%
echo.
pause

echo Test 4: Check if errorlevel works
npm --version >nul 2>&1
if errorlevel 1 (
    echo npm command failed!
) else (
    echo npm command succeeded!
)
echo.
pause

echo Test 5: Try alternative npm test
where npm
echo where npm completed with exit code: %ERRORLEVEL%
echo.
pause

echo All npm tests completed!
pause 