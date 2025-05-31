@echo off
chcp 65001 >nul
title WhatNote 智能学习助手

echo.
echo ========================================
echo    🚀 WhatNote 智能学习助手启动器
echo ========================================
echo.

:: 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

:: 检查依赖是否安装
echo 📦 检查依赖包...
python -c "import fastapi, openai, fitz" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  正在安装依赖包...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 依赖安装失败，请手动运行: pip install -r requirements.txt
        pause
        exit /b 1
    )
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
echo    主界面：http://127.0.0.1:8000/frontend_debug.html
echo    MCP测试：http://127.0.0.1:8000/mcp_test_frontend.html
echo    API文档：http://127.0.0.1:8000/docs
echo.
echo 💡 提示：
echo    - 按 Ctrl+C 停止服务
echo    - 服务启动后会自动打开浏览器
echo    - 如遇问题请查看控制台输出
echo.

:: 延迟3秒后打开浏览器
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000/frontend_debug.html"

:: 启动Python服务
python main.py

echo.
echo 👋 WhatNote服务已停止
pause 