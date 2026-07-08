# Vetrix ERP - Local Run Guide

## Backend

Windows:

```bat
cd backend
run_dev.bat
```

Manual:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

Backend health check:

```text
http://127.0.0.1:8001/
```

Expected response:

```json
{"message":"Vetrix ERP Backend Running","version":"0.4.0","status":"online"}
```

## Frontend

Windows:

```bat
cd frontend
run_dev.bat
```

Manual:

```bash
cd frontend
copy .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend URL:

```text
http://127.0.0.1:5173
```

## Ports

- Backend: `8001`
- Frontend: `5173`

## Important files

- Backend entry: `backend/main.py`
- Backend dependencies: `backend/requirements.txt`
- Frontend API config: `frontend/src/services/api.js`
- Frontend env example: `frontend/.env.example`
- Frontend routes: `frontend/src/App.jsx`

## Notes

- The SQLite database file is intentionally ignored by Git.
- To change backend URL for another device/network, edit `frontend/.env` and set `VITE_API_URL`.
- For laptop/mobile sync on the same Wi-Fi, run backend with LAN host and use the computer IP in `VITE_API_URL`.
