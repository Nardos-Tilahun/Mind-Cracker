from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import httpx
import logging # Import Logging
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.models.goal import Goal
from app.schemas.goal import StreamRequest, ModelInfo, HistoryItem, SaveGoalRequest, SloganResponse
from app.services.ai_service import ai_service
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

router = APIRouter()

class TitleRequest(BaseModel):
    context: str

# --- SAFETY NET: STATIC MODELS ---
FALLBACK_MODELS = [
    ModelInfo(id="google/gemini-2.0-flash-lite-preview-02-05:free", name="Gemini 2.0 Flash Lite", provider="Google", context_length=1000000),
    ModelInfo(id="deepseek/deepseek-r1:free", name="DeepSeek R1", provider="DeepSeek", context_length=128000),
    ModelInfo(id="mistralai/mistral-small-24b-instruct-2501:free", name="Mistral Small 3", provider="Mistral", context_length=32000),
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
    # LOGGING INCOMING REQUEST ORIGIN
    logger.info(f"Incoming /models request from: {request.headers.get('origin')}") 
    
    # 1. Check if Key exists
    if not settings.OPENROUTER_API_KEY or "sk-or" not in settings.OPENROUTER_API_KEY:
        logger.warning("⚠️ Missing or invalid OPENROUTER_API_KEY. Using fallback models.")
        return FALLBACK_MODELS

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://goalbreaker.app",
        "X-Title": "Goal Breaker",
    }

    # 2. Try to fetch 
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            logger.info("Attempting to fetch models from OpenRouter...")
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                logger.info(f"Successfully fetched {len(data)} models from OpenRouter")
                
                live_models = [
                    ModelInfo(
                        id=m["id"], 
                        name=m["name"].split("/")[-1].replace("-", " ").title(), 
                        provider=m["name"].split("/")[0].title(), 
                        context_length=m.get("context_length", 4096)
                    ) 
                    for m in data 
                    if ":free" in m["id"] or "gemini" in m["id"]
                ]
                if live_models:
                    return sorted(live_models, key=lambda x: x.name)
            else:
                logger.error(f"OpenRouter returned status {resp.status_code}. Using fallback.")
            
        except Exception as e:
            logger.error(f"OpenRouter connection failed: {str(e)}. Using fallback.")
            
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
    logger.info(f"Saving goal for user: {user_id}")
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
async def stream_goal(req: StreamRequest):
    logger.info(f"Stream requested for model: {req.model}")
    return StreamingResponse(ai_service.stream_chat(req.messages, req.model), media_type="text/plain")