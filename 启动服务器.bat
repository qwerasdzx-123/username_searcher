@echo off
cd /d "%~dp0"
echo ========================================
echo   Username Checker - Local Server
echo ========================================
echo.
echo Cleaning up old processes on ports 8888/8899...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:"0.0.0.0:8888" /C:"[::]:8888" /C:"0.0.0.0:8899" /C:"[::]:8899"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Done.
echo.
echo Starting servers...
start /B "Proxy-Server" node js/proxy-server.js >nul 2>&1
start /B "HTTP-Server" node js/simple-server.js >nul 2>&1
echo.
echo Frontend: http://localhost:8888
echo Proxy:    POST http://localhost:8899/proxy
echo ========================================
echo.
echo Waiting for input (Press Y to stop servers)...
:wait_input
choice /C YN /N >nul
if errorlevel 2 goto wait_input
echo.
echo Stopping servers...
taskkill /F /FI "WINDOWTITLE eq Proxy-Server" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HTTP-Server" >nul 2>&1
echo Cleaning up ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:"0.0.0.0:8888" /C:"[::]:8888" /C:"0.0.0.0:8899" /C:"[::]:8899"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Done. Exiting.
timeout /t 1 /nobreak >nul
exit
