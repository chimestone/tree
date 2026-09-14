@echo off
chcp 65001 >nul
echo ==========================================
echo   师徒关系树 - 本地测试
echo ==========================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ 未安装Node.js
    echo 请先安装: https://nodejs.org
    pause
    exit
)

if not exist node_modules (
    echo 正在安装依赖...
    call npm install
)

if not exist database.json (
    echo 首次启动需要创建管理员账号（密码至少8位）。
    set /p INITIAL_ADMIN_USERNAME=请输入管理员用户名: 
    set /p INITIAL_ADMIN_PASSWORD=请输入管理员密码: 
)

echo.
echo 启动服务...
echo 访问: http://localhost:3000
echo 按Ctrl+C停止
echo.

node server.js
