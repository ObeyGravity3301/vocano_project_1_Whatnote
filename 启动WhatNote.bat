@echo off
chcp 65001 >nul
title WhatNote 智能学习助手

echo.
echo ========================================
echo    🚀 WhatNote 智能学习助手启动器
echo ========================================
echo.

:: 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

:: 检查npm是否安装
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到npm，请先安装Node.js和npm
    pause
    exit /b 1
)

:: 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

:: 检查Python依赖是否安装
echo 📦 检查Python依赖包...
python -c "import fastapi, openai, fitz" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  正在安装Python依赖包...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 依赖安装失败，请手动运行: pip install -r requirements.txt
        pause
        exit /b 1
    )
)

:: 检查前端依赖是否安装
if not exist "frontend\node_modules" (
    echo 📦 安装前端依赖包...
    cd frontend
    npm install
    if errorlevel 1 (
        echo ❌ 前端依赖安装失败，请手动运行: cd frontend && npm install
        pause
        exit /b 1
    )
    cd ..
)

:: 检查.env文件
if not exist ".env" (
    echo ⚠️  未找到.env配置文件，正在创建...
    copy ".env.example" ".env" >nul 2>&1
    echo ✅ 已创建.env文件，请编辑其中的API密钥
    echo.
    echo 📝 请在.env文件中设置以下密钥：
    echo    QWEN_API_KEY=你的通义千问API密钥
    echo    QWEN_VL_API_KEY=你的通义千问视觉API密钥
    echo.
    echo 按任意键继续启动（无API密钥时部分功能不可用）...
    pause >nul
)

:: 创建必要目录
if not exist "uploads" mkdir uploads
if not exist "pages" mkdir pages
if not exist "logs" mkdir logs
if not exist "llm_logs" mkdir llm_logs
if not exist "board_logs" mkdir board_logs

echo ✅ 环境检查完成
echo.

:: 启动服务
echo 🚀 正在启动WhatNote服务...
echo.
echo 📍 服务地址：
echo    前端React应用：http://localhost:3000
echo    后端API服务：http://127.0.0.1:8000
echo    API文档：http://127.0.0.1:8000/docs
echo.
echo 💡 提示：
echo    - 前端和后端将并行启动
echo    - 按 Ctrl+C 停止任一服务
echo    - 服务启动后会自动打开浏览器
echo    - 如遇问题请查看控制台输出
echo.

:: 启动后端服务（在新窗口中）
echo 🔧 启动后端API服务...
start "WhatNote Backend" cmd /c "python main.py & pause"

:: 等待后端启动
echo ⏱️  等待后端服务启动...
timeout /t 5 /nobreak >nul

:: 启动前端服务（在新窗口中）
echo 🎨 启动前端React应用...
start "WhatNote Frontend" cmd /c "cd frontend && npm start & pause"

:: 延迟10秒后打开浏览器
echo 🌐 准备打开浏览器...
timeout /t 10 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo ✅ WhatNote前后端服务已启动完成！
echo.
echo 📋 服务状态：
echo    - 前端：http://localhost:3000 （React开发服务器）
echo    - 后端：http://127.0.0.1:8000 （FastAPI服务器）
echo.
echo 🔄 如需重启服务，请关闭相应窗口后重新运行此脚本
echo.
pause 