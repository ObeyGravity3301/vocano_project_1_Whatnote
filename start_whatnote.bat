@echo off
echo =================================
echo      启动 WhatNote 应用
echo =================================
echo.

:: 检查Python是否可用
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到Python，请确保Python已安装并添加到PATH
    pause
    exit /b 1
)

:: 检查Node.js是否可用  
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到Node.js，请确保Node.js已安装并添加到PATH
    pause
    exit /b 1
)

echo ✅ Python和Node.js环境检查通过
echo.

:: 启动后端服务
echo 🚀 启动后端服务（端口8000）...
start "WhatNote Backend" python main.py

:: 等待后端启动
echo ⏳ 等待后端服务启动...
timeout /t 5 /nobreak >nul

:: 启动前端服务
echo 🌐 启动前端服务（端口3000）...
cd frontend
start "WhatNote Frontend" npm start
cd ..

echo.
echo ✅ WhatNote 已启动！
echo.
echo 📌 访问地址:
echo   前端: http://localhost:3000
echo   后端: http://localhost:8000
echo.
echo 💡 提示:
echo   - 前端窗口将自动打开浏览器
echo   - 后端在控制台窗口中运行
echo   - 关闭控制台窗口将停止服务
echo.
echo 🔧 如果遇到问题:
echo   - 确保端口3000和8000未被占用
echo   - 检查防火墙设置
echo   - 运行: python test_basic_functionality.py 进行测试
echo.

pause 