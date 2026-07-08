@echo off
setlocal
cd /d "%~dp0"

if not exist .env (
  copy .env.example .env
)

npm install
npm run dev -- --host 127.0.0.1 --port 5173
