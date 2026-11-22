@echo off
title Google Student Ambassador - Certificate Portal
cd /d "%~dp0"
echo Starting GSA Certificate Portal...
start http://localhost:3000
node server.js
pause
