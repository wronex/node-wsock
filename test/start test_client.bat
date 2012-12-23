@echo off
title WebSocket Client
:start
echo.
echo ---------------------------
echo Ready to start
pause
echo Press CTRL-C twice to stop
echo Starting . . .
node test_client.js
goto start