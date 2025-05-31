@echo off
chcp 65001 >nul
title WhatNote 管理工具

:main_menu
cls
echo ================================================
echo             WhatNote 智能笔记系统
echo                 管理工具 v1.0
echo ================================================
echo.
echo 请选择要执行的操作：
echo.
echo 1. 启动 WhatNote 服务
echo 2. 停止 WhatNote 服务  
echo 3. 检查服务状态
echo 4. 查看帮助信息
echo 5. 退出程序
echo.
echo ================================================
set /p choice=请输入选项数字 (1-5): 

:: 验证输入
if "%choice%"=="1" goto start_services
if "%choice%"=="2" goto stop_services
if "%choice%"=="3" goto check_status
if "%choice%"=="4" goto show_help
if "%choice%"=="5" goto exit_program

:: 无效输入
echo.
echo ❌ 无效选项，请输入 1-5 之间的数字
timeout /t 2 /nobreak >nul
goto main_menu

:start_services
cls
echo ================================================
echo             启动 WhatNote 服务
echo ================================================
echo.

:: 检查Python是否安装
echo 🔍 检查运行环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到Python，请先安装Python 3.7+
    echo.
    pause
    goto main_menu
)

:: 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到Node.js，请先安装Node.js 14+
    echo.
    pause
    goto main_menu
)

echo ✅ 环境检查完成
echo.

:: 检查服务是否已经在运行
echo 🔍 检查服务状态...
curl -s http://127.0.0.1:8000/health >nul 2>&1
if not errorlevel 1 (
    echo ⚠️  后端服务已在运行中
    echo 📡 后端服务: http://127.0.0.1:8000
    echo 🌐 前端服务: http://localhost:3000
    echo.
    echo 如果需要重启服务，请先选择"停止服务"
    pause
    goto main_menu
)

:: 检查是否安装了依赖
if not exist "frontend\node_modules" (
    echo 🔧 首次运行，正在安装前端依赖...
    cd frontend
    call npm install
    cd ..
    if errorlevel 1 (
        echo ❌ 前端依赖安装失败
        pause
        goto main_menu
    )
    echo ✅ 前端依赖安装完成
)

echo 🚀 正在启动WhatNote服务...
echo.

:: 创建日志目录
if not exist "logs" mkdir logs

:: 启动后端服务（在后台）
echo 📡 启动后端服务...
start "WhatNote Backend" /min cmd /c "python main.py > logs\backend.log 2>&1"

:: 等待后端启动
echo ⏳ 等待后端服务启动...
timeout /t 3 /nobreak >nul

:: 检查后端是否启动成功
set /a attempts=0
:check_backend_start
set /a attempts+=1
curl -s http://127.0.0.1:8000/health >nul 2>&1
if errorlevel 1 (
    if %attempts% lss 15 (
        echo 🔄 后端服务启动中... (%attempts%/15)
        timeout /t 2 /nobreak >nul
        goto check_backend_start
    ) else (
        echo ❌ 后端服务启动超时，请检查日志文件
        echo 日志位置: logs\backend.log
        pause
        goto main_menu
    )
)

echo ✅ 后端服务已启动

:: 启动前端服务
echo 🌐 启动前端服务...
cd frontend
start "WhatNote Frontend" cmd /c "npm start"
cd ..

echo.
echo ================================================
echo 🎉 WhatNote启动完成！
echo.
echo 📡 后端服务: http://127.0.0.1:8000
echo 🌐 前端服务: http://localhost:3000
echo 🔍 健康检查: http://127.0.0.1:8000/health
echo.
echo 💡 提示：
echo    - 前端页面将自动在浏览器中打开
echo    - 可以安装为PWA应用，获得更好的体验
echo    - 关闭此窗口不会停止服务
echo    - 要停止服务，请选择"停止服务"选项
echo ================================================
echo.
pause
goto main_menu

:stop_services
cls
echo ================================================
echo             停止 WhatNote 服务
echo ================================================
echo.

echo 🛑 正在停止WhatNote服务...
echo.

:: 停止后端Python进程
echo 📡 停止后端服务...
taskkill /f /im python.exe >nul 2>&1
if not errorlevel 1 (
    echo ✅ 后端服务已停止
) else (
    echo ℹ️  未发现运行中的后端服务
)

:: 停止前端Node.js进程
echo 🌐 停止前端服务...
taskkill /f /im node.exe >nul 2>&1
if not errorlevel 1 (
    echo ✅ 前端服务已停止
) else (
    echo ℹ️  未发现运行中的前端服务
)

:: 停止可能的npm进程
taskkill /f /im npm.cmd >nul 2>&1

echo.
echo ================================================
echo ✅ WhatNote服务已全部停止
echo ================================================
echo.
pause
goto main_menu

:check_status
cls
echo ================================================
echo             检查 WhatNote 服务状态
echo ================================================
echo.

echo 🔍 正在检查服务状态...
echo.

:: 检查后端服务
echo 📡 检查后端服务状态...
curl -s http://127.0.0.1:8000/health >nul 2>&1
if not errorlevel 1 (
    echo ✅ 后端服务运行正常
    echo    地址: http://127.0.0.1:8000
    
    :: 尝试获取详细状态
    for /f "delims=" %%i in ('curl -s http://127.0.0.1:8000/health 2^>nul') do (
        echo    状态: %%i
    )
) else (
    echo ❌ 后端服务未运行
)

echo.

:: 检查前端服务（通过进程）
echo 🌐 检查前端服务状态...
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
if not errorlevel 1 (
    echo ✅ 前端服务可能正在运行
    echo    地址: http://localhost:3000
) else (
    echo ❌ 前端服务未运行
)

echo.

:: 检查端口占用情况
echo 🔌 检查端口占用情况...
netstat -an | find "127.0.0.1:8000" >nul 2>&1
if not errorlevel 1 (
    echo ✅ 端口 8000 已被占用（后端）
) else (
    echo ❌ 端口 8000 未被占用
)

netstat -an | find ":3000" >nul 2>&1
if not errorlevel 1 (
    echo ✅ 端口 3000 已被占用（前端）
) else (
    echo ❌ 端口 3000 未被占用
)

echo.
echo ================================================
echo 状态检查完成
echo ================================================
echo.
pause
goto main_menu

:show_help
cls
echo ================================================
echo             WhatNote 帮助信息
echo ================================================
echo.
echo 📋 关于 WhatNote：
echo    WhatNote 是一个基于AI的智能PDF笔记生成系统
echo    支持视觉识别、智能注释和专家分析功能
echo.
echo 🚀 快速使用：
echo    1. 选择"启动服务"开始使用
echo    2. 浏览器会自动打开应用界面
echo    3. 上传PDF文件开始体验
echo    4. 使用完毕后选择"停止服务"
echo.
echo 💻 系统要求：
echo    - Python 3.7+ 
echo    - Node.js 14+
echo    - Chrome/Edge 浏览器（推荐）
echo.
echo 📍 服务地址：
echo    - 前端应用: http://localhost:3000
echo    - 后端API: http://127.0.0.1:8000
echo    - 健康检查: http://127.0.0.1:8000/health
echo.
echo 🔧 故障排除：
echo    - 如果启动失败，检查Python和Node.js是否安装
echo    - 查看 logs\backend.log 获取详细错误信息
echo    - 确保8000和3000端口未被其他程序占用
echo.
echo 🎯 PWA应用：
echo    启动后可在浏览器地址栏点击安装图标，
echo    将WhatNote安装为桌面应用，获得更好体验
echo.
echo ================================================
echo.
pause
goto main_menu

:exit_program
cls
echo ================================================
echo             感谢使用 WhatNote
echo ================================================
echo.
echo 👋 程序即将退出...
echo.
echo 💡 小贴士：
echo    如果服务正在运行，请记得先停止服务
echo    以释放系统资源
echo.
timeout /t 3 /nobreak >nul
exit /b 0 