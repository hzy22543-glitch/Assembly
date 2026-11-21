@echo off
cd /d "%~dp0"
set SANDBOX_HOST=0.0.0.0
set SANDBOX_PORT=5000
python api_endpoint.py
