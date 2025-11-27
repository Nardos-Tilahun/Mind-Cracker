from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import httpx
import logging
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.models.goal import Goal
from app.schemas.goal import StreamRequest, ModelInfo, HistoryItem, SaveGoalRequest, SloganResponse
from app.services.ai_service import ai_service
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Import Limiter
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger("uvicorn.error")

router = APIRouter()

class TitleRequest(BaseModel):
    context: str

# --- STRICTLY ORDERED FALLBACK MODELS ---
FALLBACK_MODELS = [
    ModelInfo(id="google/gemini-2.5-flash-lite", name="Gemini 2.5 Flash Lite", provider="Google", context_length=1000000),
    ModelInfo(id="xai/grok-code-fast-1", name="Grok Code Fast 1", provider="Xai", context_length=128000),
    ModelInfo(id="qwen/qwen3-coder-flash", name="Qwen3 Coder Flash", provider="Qwen", context_length=128000),
    ModelInfo(id="xai/qwen-qwen3-235b-a22b", name="Qwen3 235B A22B", provider="Xai", context_length=128000),
    ModelInfo(id="google/gemini-2.0-flash", name="Gemini 2.0 Flash", provider="Google", context_length=1000000),
    ModelInfo(id="xai/grok-code-fast-1", name="Grok Code Fast 1", provider="Xai", context_length=128000),
    ModelInfo(id="qwen/qwen-turbo", name="Qwen Turbo", provider="Qwen", context_length=128000),
    ModelInfo(id="grok/grok-4.1-fast:free", name="Grok 4.1 Fast (Free)", provider="Grok", context_length=128000),
    ModelInfo(id="deepseek/deepseek-r1-0528-qwen3-8b", name="Deepseek R1 0528 Qwen3 8B", provider="Deepseek", context_length=128000),
]

@router.post("/generate-title")
async def generate_title(req: TitleRequest):
    return {"title": await ai_service.generate_title(req.context)}

@router.get("/slogans", response_model=SloganResponse)
async def get_slogans(response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return {"slogans": await ai_service.generate_slogans()}

@router.get("/models", response_model=List[ModelInfo])
async def get_models(request: Request):
    # 1. Check Key...
    if not settings.OPENROUTER_API_KEY or "sk-or" not in settings.OPENROUTER_API_KEY:
        return FALLBACK_MODELS

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://goalbreaker.app",
        "X-Title": "Goal Breaker",
    }

    # If OpenRouter check fails, we fallback to the strictly ordered list
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                live_models = [
                    ModelInfo(
                        id=m["id"],
                        name=m["name"].split("/")[-1].replace("-", " ").title(),
                        provider=m["name"].split("/")[0].title(),
                        context_length=m.get("context_length", 4096)
                    )
                    for m in data
                    if ":free" in m["id"] or any(x in m["id"] for x in ["gemini", "grok", "qwen"])
                ]
                if live_models:
                    def model_priority(m):
                        mid = m.id.lower()
                        preferred_order = [m.id for m in FALLBACK_MODELS]
                        if m.id in preferred_order:
                            return preferred_order.index(m.id) - 100 # Top priority
                        
                        if "gemini" in mid and ("flash" in mid or "lite" in mid) and "exp" not in mid and "preview" not in mid: return 0
                        if "gemini" in mid and ("preview" in mid or "exp" in mid): return 1
                        if "gemini" in mid: return 2
                        if "grok" in mid: return 3
                        if "qwen" in mid: return 4
                        if "deepseek" in mid: return 5
                        return 10
                    return sorted(live_models, key=model_priority)
        except Exception:
            pass
    return FALLBACK_MODELS

@router.get("/history/{user_id}", response_model=List[HistoryItem])
async def get_history(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.user_id == user_id).order_by(Goal.updated_at.desc()))
    return [
        HistoryItem(
            id=g.id, goal=g.original_goal, model=g.model_used or "Multi-Agent",
            date=g.updated_at or g.created_at, preview=g.breakdown or [],
            thinking=g.thinking_process, chat_history=g.chat_history or []
        ) for g in result.scalars().all()
    ]

@router.post("/goals/{user_id}")
async def create_goal(user_id: str, req: SaveGoalRequest, db: AsyncSession = Depends(get_db)):
    if len(req.title) > 5000: raise HTTPException(400, "Goal title too long")

    new_goal = Goal(
        user_id=user_id, original_goal=req.title, chat_history=req.chat_history,
        breakdown=req.preview, model_used="Multi-Agent",
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
@limiter.limit("5/minute")
async def stream_goal(req: StreamRequest, request: Request):
    if not req.messages or len(req.messages) == 0:
        raise HTTPException(400, "Empty message list")

    last_msg = req.messages[-1].content
    if len(last_msg) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars)")

    return StreamingResponse(ai_service.stream_chat(req.messages, req.model), media_type="text/plain")