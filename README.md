# 🧠 Goal Cracker

**Turn ambiguous ambitions into actionable strategy.**

![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)

Goal Cracker is not just another chat bot. It is a **Strategic AI Planning Engine** designed to break down complex, overwhelming goals into structured, executed plans.

---

## 🚀 Why Goal Cracker is Different

Most AI tools just "talk" to you. Goal Cracker **architects** for you.

1. **Multi-Agent "War Room":** Instead of relying on one AI, you can switch agents (e.g., **Llama 3.3** for reasoning, **Mixtral** for speed) within the same thread to get peer-reviewed strategies.
2. **Visual Complexity Mapping:** We don't just give you text. The system analyzes the difficulty of every step and plots a **Complexity Chart**, helping you identify bottlenecks early.
3. **Transparent "Thinking" Process:** View raw reasoning, self-correction, and logic through expandable `<Thinking>` logs.
4. **Branching Timelines:** Edit any previous message to fork the conversation and create alternate strategy paths.

---

## 📖 How to Use

1. **Define the Goal:** Example: _"Launch a SaaS in 30 days"_
2. **Watch the Reasoning:** Visual pulsing brain icon indicates the reasoning phase.
3. **Review the Blueprint:** Receive a JSON-structured plan with difficulty ratings.
4. **Analyze the Chart:** View the automatically rendered complexity bar chart.
5. **Refine & Pivot:**
   - Edit your message to adjust constraints.
   - Switch models using the built‑in model selector.

---

## ✨ Key Features

- ⚡ **Real-Time Streaming** with custom JSON/Text parsing.
- 🔐 **Secure Authentication** via Better Auth (Email & Google OAuth).
- 💾 **Persistent Chat History** with branching and complexity metrics.
- 🛡️ **Rate Limiting** using SlowAPI.
- 🎨 **Modern UI** powered by Tailwind v4, Shadcn, Framer Motion.

---

## 🛠️ Tech Stack

### **Frontend**

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Shadcn UI
- Framer Motion
- Recharts

### **Backend**

- FastAPI (Python 3.11)
- PostgreSQL (AsyncPG + SQLAlchemy)
- Groq API via HTTPX
- CORSMiddleware + SlowAPI

---

## 🚀 Getting Started

### 1. Prerequisites

- Docker & Docker Compose (Recommended)
- Or Node.js 20+ and Python 3.11+
- PostgreSQL database (Local or Neon/Supabase)

### 2. Environment Setup

#### **Backend (`backend/.env`)**

```ini
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
GROQ_API_KEY="gsk_..."
```

#### **Frontend (`frontend/.env`)**

```ini
NEXT_PUBLIC_API_URL="http://localhost:8000"
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
BETTER_AUTH_SECRET="your_generated_secret_string"
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

---

## 🐳 3. Run with Docker (Recommended)

```bash
docker-compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ⚙️ 4. Manual Installation

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python migrate_db.py
python prestart.py
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 📂 Project Structure

```bash
goal-breaker/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   ├── migrate_db.py
│   └── Dockerfile
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── Dockerfile
├── docker-compose.yml
└── render.yaml
```

---

## ☁️ Deployment

Includes `render.yaml` for instant Render deployment.

1. Push repo to GitHub
2. Connect GitHub to Render
3. Render auto-detects blueprint
4. Fill required environment variables

Ensure DB is publicly accessible (Neon/Render PostgreSQL).

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Commit changes
4. Open a Pull Request

---

Happy building with **Goal Cracker**! 🧠⚡
