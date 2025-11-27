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

1.  **Multi-Agent "War Room":** Instead of relying on one AI, you can switch agents (e.g., Gemini for creativity, DeepSeek for logic) within the _same_ thread to get peer-reviewed strategies.
2.  **Visual Complexity Mapping:** We don't just give you text. The system analyzes the difficulty of every step and plots a **Complexity Chart**, helping you identify bottlenecks before you start.
3.  **Transparent "Thinking" Process:** See exactly how the AI formulates its strategy. Open the `<Thinking>` logs to view the raw reasoning, self-correction, and logic before the final answer is generated.
4.  **Branching Timelines:** Made a mistake? Edit a previous message, and the conversation forks. You can navigate between different "versions" of your strategy without losing the original history.

---

## 📖 How to Use

1.  **Define the Goal:** Enter a high-level goal (e.g., _"Launch a SaaS in 30 days"_).
2.  **Watch the Reasoning:** The agent enters a "Reasoning" phase (visualized by a pulsing brain icon). You can expand this to read the AI's internal monologue.
3.  **Review the Blueprint:** The AI returns a JSON-structured plan with specific steps and a difficulty rating (1-10).
4.  **Analyze the Chart:** A bar chart automatically renders, showing the complexity curve of your project.
5.  **Refine & Pivot:**
    - Click **"Edit"** on your message to change constraints.
    - Use the **Model Selector** to switch the active agent for the next response.

---

## ✨ Key Features

- **⚡ Real-Time Streaming:** Low-latency token streaming with custom parsing for JSON/Text splitting.
- **🔐 Robust Auth:** Secure authentication via **Better Auth** (Email & Google OAuth).
- **💾 Persistent History:** Automatic saving of chat sessions, branching histories, and complexity metrics to PostgreSQL.
- **🛡️ Rate Limiting:** Backend protected by `SlowAPI` to prevent abuse.
- **🎨 Modern UI:** Built with Tailwind v4, Shadcn UI, and Framer Motion for fluid animations.

---

## 🛠️ Tech Stack

### **Frontend**

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4, Shadcn UI
- **Animation:** Framer Motion
- **State:** React Hooks & Context API
- **Visualization:** Recharts

### **Backend**

- **Framework:** FastAPI (Python 3.11)
- **Database:** PostgreSQL (AsyncPG + SQLAlchemy)
- **AI Engine:** HTTPX (OpenRouter & Gemini APIs)
- **Security:** CORSMiddleware, SlowAPI (Rate Limiting)

---

## 🚀 Getting Started

### 1. Prerequisites

- **Docker & Docker Compose** (Recommended)
- _Or:_ Node.js 20+ and Python 3.11+
- A PostgreSQL Database URL (Local or Cloud like Neon/Supabase)

### 2. Environment Setup

You must create `.env` files for both the backend and frontend.

**Backend (`backend/.env`):**

```ini
# Database Connection (Must match frontend DB)
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# AI Providers
OPENROUTER_API_KEY="sk-or-..."
GEMINI_API_KEY="AIza..."
```

**Frontend (`frontend/.env`):**

```ini
# Backend Connection
NEXT_PUBLIC_API_URL="http://localhost:8000"

# Database (Same as backend)
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Auth Configuration
BETTER_AUTH_SECRET="your_generated_secret_string"
BETTER_AUTH_URL="http://localhost:3000"

# OAuth (Optional - Get from Google Cloud Console)
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

### 3. Run with Docker 🐳 (Recommended)

The easiest way to spin up the entire stack.

```bash
# Build and start services
docker-compose up --build
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend:** [http://localhost:8000](http://localhost:8000)
- **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 4. Manual Installation (Development)

If you prefer running services individually without Docker:

#### **Backend Setup**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run Migrations & Start Server
python migrate_db.py
python prestart.py
uvicorn main:app --reload --port 8000
```

#### **Frontend Setup**

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
│   │   ├── api/          # Endpoints (Goals, Streaming)
│   │   ├── core/         # DB Config, Security settings
│   │   ├── models/       # SQLAlchemy Database Models
│   │   ├── services/     # AI Logic (Prompt Engineering)
│   ├── migrate_db.py     # Custom schema repair script
│   └── Dockerfile
├── frontend/
│   ├── app/              # Next.js 16 App Router
│   ├── components/
│   │   ├── dashboard/    # Chat Stream & Visualization UI
│   │   ├── features/     # Chat Inputs, Agent Cards
│   ├── lib/              # Auth Client & API Utilities
│   └── Dockerfile
├── docker-compose.yml    # Orchestration
└── render.yaml           # Deployment Blueprint
```

---

## ☁️ Deployment

This project includes a `render.yaml` for one-click deployment on **Render**.

1. Push your repo to GitHub.
2. Link your GitHub account to Render.
3. Select the repository; Render will automatically detect the blueprint.
4. Fill in the environment variables when prompted.

> **Note:** Ensure your database URL is accessible from the cloud (e.g., using Neon.tech or Render PostgreSQL).

---

## 🤝 Contributing

We welcome strategic minds!

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/NewStrategy`).
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.
