import sys
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import httpx
import logging
import asyncio
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.models.goal import Goal
from app.schemas.goal import StreamRequest, ModelInfo, HistoryItem, SaveGoalRequest, SloganResponse
from app.services.ai_service import ai_service
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from slowapi import Limiter
from slowapi.util import get_remote_address

logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

class TitleRequest(BaseModel):
    context: str

FALLBACK_GROQ_MODELS = [
    {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B (Versatile)"},
    {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B (Instant)"},
    {"id": "gemma2-9b-it", "name": "Gemma 2 9B"}
]

model_cache = {
    "data": [],
    "timestamp": 0
}

async def fetch_groq_models():
    now = datetime.utcnow().timestamp()
    if model_cache["data"] and (now - model_cache["timestamp"] < 10):
        return model_cache["data"]

    print("🔄 [MODELS] Fetching fresh list from Groq...", flush=True)

    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    final_list = []

    BLOCKED_KEYWORDS = [
        "whisper", "tts", "audio", "guard", "vision", "embed",
        "speech", "distil-whisper", "playback", "tool-use", "gpt", "oss",
        "playai"
    ]

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("https://api.groq.com/openai/v1/models", headers=headers)

            if resp.status_code == 200:
                data = resp.json().get("data", [])
                for m in data:
                    mid = m.get("id", "")
                    mid_lower = mid.lower()

                    if any(block in mid_lower for block in BLOCKED_KEYWORDS):
                        continue

                    name = mid.replace("-", " ").title()
                    name = name.replace("Llama 3", "Llama 3")
                    name = name.replace("Versatile", "(V)")
                    name = name.replace("Instant", "(I)")
                    name = name.replace("Developer", "(Dev)")

                    final_list.append(ModelInfo(
                        id=mid,
                        name=name,
                        provider="Groq",
                        context_length=m.get("context_window", 8192)
                    ))

                final_list.sort(key=lambda x: 0 if "3.3" in x.id else 1)
                print(f"✅ [MODELS] Found {len(final_list)} chat-compatible models.", flush=True)
            else:
                raise Exception(f"Status {resp.status_code}")

    except Exception as e:
        print(f"⚠️ [MODELS] Fetch failed ({e}). Using fallback.", flush=True)
        final_list = [
            ModelInfo(id=m["id"], name=m["name"], provider="Groq", context_length=32000)
            for m in FALLBACK_GROQ_MODELS
        ]

    model_cache["data"] = final_list
    model_cache["timestamp"] = now
    return final_list

@router.post("/generate-title")
async def generate_title(req: TitleRequest):
    return {"title": await ai_service.generate_title(req.context)}

@router.get("/slogans", response_model=SloganResponse)
async def get_slogans(response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return {"slogans": await ai_service.generate_slogans()}

@router.get("/models", response_model=List[ModelInfo])
async def get_models(request: Request):
    return await fetch_groq_models()

@router.get("/history/{user_id}", response_model=List[HistoryItem])
async def get_history(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.user_id == user_id).order_by(Goal.updated_at.desc()))
    return [
        HistoryItem(
            id=g.id, goal=g.original_goal, model=g.model_used or "Groq",
            date=g.updated_at or g.created_at, preview=g.breakdown or [],
            thinking=g.thinking_process, chat_history=g.chat_history or []
        ) for g in result.scalars().all()
    ]

@router.get("/goals/{goal_id}")
async def get_goal_by_id(goal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(404, "Goal not found")
    
    return {
        "id": goal.id,
        "title": goal.original_goal,
        "chat_history": goal.chat_history or [],
        "created_at": goal.created_at
    }

@router.post("/goals/{user_id}")
async def create_goal(user_id: str, req: SaveGoalRequest, db: AsyncSession = Depends(get_db)):
    if len(req.title) > 5000: raise HTTPException(400, "Goal title too long")

    new_goal = Goal(
        user_id=user_id, original_goal=req.title, chat_history=req.chat_history,
        breakdown=req.preview, model_used="Groq Multi-Model",
        created_at=datetime.utcnow(), updated_at=datetime.utcnow()
    )
    db.add(new_goal)
    await db.commit()
    await db.refresh(new_goal)
    return {"id": new_goal.id, "message": "Goal saved"}

@router.put("/goals/{goal_id}")
async def update_goal(goal_id: int, req: SaveGoalRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal: raise HTTPException(404, "Goal not found")
    goal.chat_history = req.chat_history
    goal.original_goal = req.title
    if req.preview: goal.breakdown = req.preview
    goal.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Goal updated"}

@router.delete("/history/{user_id}")
async def clear_history(user_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Goal).where(Goal.user_id == user_id))
    await db.commit()
    return {"message": "History cleared"}

@router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Goal).where(Goal.id == goal_id))
    await db.commit()
    return {"message": "Goal deleted"}

@router.post("/stream-goal")
@limiter.limit("60/minute")
async def stream_goal(req: StreamRequest, request: Request):
    if not req.messages or len(req.messages) == 0:
        raise HTTPException(400, "Empty message list")

    target_model = req.model if req.model else "llama-3.3-70b-versatile"

    print(f"📥 [BACKEND] Streaming Request. Target: {target_model}", flush=True)

    return StreamingResponse(ai_service.stream_chat(req.messages, target_model), media_type="text/plain")