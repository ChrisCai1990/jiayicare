@echo off
echo ========================================
echo    嘉医管家后端 Railway 部署脚本
echo ========================================
echo.

set PATH=C:\Program Files\nodejs;%PATH%
cd /d "D:\Claude CODE\JiayiCare-backend"

echo [1/4] 登录 Railway（浏览器会自动打开，点 Authorize 授权）...
railway login
if %errorlevel% neq 0 (
    echo 登录失败，请重试
    pause
    exit /b 1
)
echo 登录成功！
echo.

echo [2/4] 关联项目...
railway link --project "e9fd9c8d-ae1e-4edf-9d12-8c93a9cadb5e"
if %errorlevel% neq 0 (
    echo 关联失败
    pause
    exit /b 1
)
echo 关联成功！
echo.

echo [3/4] 设置环境变量...
railway variables --set "MONGODB_URI=mongodb://mongo:JdpeVcLfUCPbXjOVzdZEPvLihTYBhtjK@mongodb-fyr6.railway.internal:27017" --set "JWT_SECRET=jiayicare_jwt_secret_2025_secure" --set "JWT_EXPIRES_IN=30d" --set "NODE_ENV=production" --set "PORT=3000"
echo 环境变量设置完成！
echo.

echo [4/4] 上传并部署代码...
railway up --detach
echo.
echo ========================================
echo 部署完成！正在获取服务地址...
railway domain
echo ========================================
pause
