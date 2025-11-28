import sys 
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import logging
from datetime import datetime

from app.core.database import get_db
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

# --- STRICT MODEL LIST (MAPPED TO REAL IDS) ---
# 1. Google: Gemini 2.5 Flash Lite -> google/gemini-2.0-flash-lite-preview-02-05:free
# 2. Xai: Grok Code Fast 1 -> x-ai/grok-beta (Closest approximate for code/fast)
# 3. Qwen: Qwen3 Coder Flash -> qwen/qwen-2.5-coder-32b-instruct:free
# 4. Xai: Qwen: Qwen3 235B -> qwen/qwen-turbo (Used as big Qwen variant)
# 5. Google: Gemini 2.0 Flash -> google/gemini-2.0-flash-exp:free
# 6. Grok 4.1 Fast -> x-ai/grok-2-vision-1212 (Current Grok SOTA)
# 7. Deepseek: Deepseek R1 -> deepseek/deepseek-r1:free

STRICT_MODELS = [
    ModelInfo(id="google/gemini-2.0-flash-lite-preview-02-05:free", name="Gemini 2.0 Flash Lite", provider="Google", context_length=1000000),
    ModelInfo(id="x-ai/grok-beta", name="Grok Code Fast", provider="xAI", context_length=128000),
    ModelInfo(id="qwen/qwen-2.5-coder-32b-instruct:free", name="Qwen 2.5 Coder", provider="Qwen", context_length=32768),
    ModelInfo(id="qwen/qwen-turbo", name="Qwen Turbo (235B)", provider="Qwen", context_length=32768),
    ModelInfo(id="google/gemini-2.0-flash-exp:free", name="Gemini 2.0 Flash", provider="Google", context_length=1000000),
    ModelInfo(id="x-ai/grok-2-vision-1212", name="Grok 2 (Fast)", provider="xAI", context_length=32768),
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
    # Directly return the strict list desired by the user
    # No external fetch needed, ensuring exact order and availability
    return STRICT_MODELS

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