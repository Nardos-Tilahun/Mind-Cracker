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

# Fallback in case OpenRouter API is down
FALLBACK_MODELS = [
    ModelInfo(id="google/gemini-2.0-flash-lite-preview-02-05:free", name="Gemini 2.0 Flash Lite", provider="Google", context_length=1000000),
    ModelInfo(id="deepseek/deepseek-r1:free", name="DeepSeek R1", provider="DeepSeek", context_length=64000),
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
    """
    Dynamic Fetch: Retrieves ALL models currently available on OpenRouter.
    No filtering is applied.
    """
    if not settings.OPENROUTER_API_KEY:
        logger.warning("No OpenRouter API Key found. Returning fallbacks.")
        return FALLBACK_MODELS

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://goalbreaker.app",
        "X-Title": "Goal Breaker",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # 1. Fetch from OpenRouter
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                
                # 2. Map response to our ModelInfo schema
                live_models = []
                for m in data:
                    # Clean up Provider Name (usually before the slash in ID)
                    model_id = m.get("id", "")
                    provider_raw = model_id.split("/")[0] if "/" in model_id else "Unknown"
                    
                    # Capitalize provider nicely (e.g., "google" -> "Google", "x-ai" -> "X-Ai")
                    provider_name = provider_raw.replace("-", " ").title()

                    live_models.append(
                        ModelInfo(
                            id=model_id,
                            name=m.get("name", model_id),
                            provider=provider_name,
                            context_length=m.get("context_length", 4096)
                        )
                    )
                
                # 3. Sort for better UX (Optional, but helps find things in the massive list)
                # Sort by Provider, then by Name
                live_models.sort(key=lambda x: (x.provider, x.name))
                
                return live_models
            
            else:
                logger.error(f"OpenRouter API Error: {resp.status_code} - {resp.text}")
                
        except Exception as e:
            logger.error(f"Failed to fetch models from OpenRouter: {e}")
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
@limiter.limit("30/minute")
async def stream_goal(req: StreamRequest, request: Request):
    if not req.messages or len(req.messages) == 0:
        raise HTTPException(400, "Empty message list")

    last_msg = req.messages[-1].content
    if len(last_msg) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars)")

    return StreamingResponse(ai_service.stream_chat(req.messages, req.model), media_type="text/plain")