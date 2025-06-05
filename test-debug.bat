@echo off
echo Test Script Started
echo Current Directory: %CD%
echo Script Location: %~dp0
echo.
echo If you can see this message, the basic script works!
echo.
pause
echo.
echo Testing commands one by one...
echo.

echo Testing echo command...
echo This is a test message

echo.
echo Testing dir command...
dir /b

echo.
echo Testing if exist command...
if exist "main.py" (
    echo main.py found
) else (
    echo main.py not found
)

echo.
echo Testing PATH variable...
echo PATH: %PATH%

echo.
echo All basic tests completed!
pause 