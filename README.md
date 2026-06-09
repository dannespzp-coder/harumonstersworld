# Harumonstersworld

El Digital World de Haru — criaturas de datos que viven, evolucionan y mueren.

## Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind → Vercel
- **Backend**: FastAPI (Python) → Render
- **DB**: PostgreSQL → Neon.tech

## Variables de entorno

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://harumonstersworldapi.onrender.com
```

### Backend (Render env vars)
```
DATABASE_URL=postgresql://...
JWT_SECRET=tu_secret_aqui
GOD_PASSWORD=danielharu123
```

## Desarrollo local

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
