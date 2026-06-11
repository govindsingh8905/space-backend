# NEXUS Orbital Debris Tracker

This project is separated into:
- `/frontend`: Next.js frontend application (runs on Netlify)
- `/backend`: FastAPI Python backend application for orbit propagation (optional, falls back to mock data if offline)

## Local Development

### 1. Frontend
Navigate into the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```

### 2. Backend
Navigate into the `backend` folder:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
