@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   ============================================
echo    天机衍世  -  本地启动
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Node.js
  echo.
  echo   请先安装 Node.js 后重试：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo   [1/3] 检查依赖 ...
if not exist "node_modules" (
  echo         首次运行，正在安装依赖，请稍候 ...
  call npm install
  if errorlevel 1 (
    echo.
    echo   [错误] 依赖安装失败，请检查网络后重试。
    echo.
    pause
    exit /b 1
  )
) else (
  echo         依赖已就绪
)

set NEED_BUILD=0
if /i "%~1"=="rebuild" set NEED_BUILD=1
if not exist "dist-local\index.html" set NEED_BUILD=1

echo   [2/3] 检查本地版本 ...
if "!NEED_BUILD!"=="1" (
  echo         正在构建，请稍候 ...
  call npm run build:local
  if errorlevel 1 (
    echo.
    echo   [错误] 构建失败，请查看上方报错信息。
    echo.
    pause
    exit /b 1
  )
) else (
  echo         已就绪，如需重新构建请执行：启动游戏.bat rebuild
)

echo   [3/3] 启动本地服务，浏览器将自动打开 ...
node "tools\serve-local.js"

echo.
echo   服务已停止。
pause
