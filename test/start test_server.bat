@echo off
title WebSocket Server
:start
echo.
echo ---------------------------
echo Ready to start
pause
echo Press CTRL-C twice to stop
echo Starting . . .
node test_server.js
goto start