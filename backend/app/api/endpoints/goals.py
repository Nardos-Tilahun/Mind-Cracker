from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from typing import List
import httpx
from datetime import datetime

from app.core.database import get_db
from app.models.goal import Goal
from app.schemas.goal import StreamRequest, ModelInfo, HistoryItem, SaveGoalRequest, SloganResponse
from app.services.ai_service import ai_service
from pydantic import BaseModel

router = APIRouter()

class TitleRequest(BaseModel):
    context: str

@router.post("/generate-title")
async def generate_title(req: TitleRequest):
    title = await ai_service.generate_title(req.context)
    return {"title": title}

@router.get("/slogans", response_model=SloganResponse)
async def get_slogans(response: Response):
    """Fetches a fresh batch of slogans for the frontend buffer."""
    # Prevent browser from caching the slogans so we get fresh ones on refresh
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    slogans = await ai_service.generate_slogans()
    return {"slogans": slogans}

@router.get("/models", response_model=List[ModelInfo])
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get("https://openrouter.ai/api/v1/models")
            resp.raise_for_status()
            data = [m for m in resp.json().get("data", []) if ":free" in m["id"] or "grok" in m["id"] or "deepseek" in m["id"] or "qwen" in m["id"]]
            return [
                ModelInfo(id=m["id"], name=m["name"].split("/")[-1].title(), provider=m["name"].split("/")[0].title(), context_length=m.get("context_length", 4096))
                for m in data
            ]
        except Exception as e: 
            print(f"Failed to fetch models: {e}")
            return []

@router.get("/history/{user_id}", response_model=List[HistoryItem])
async def get_history(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.user_id == user_id).order_by(Goal.updated_at.desc()))
    goals = result.scalars().all()
    return [
        HistoryItem(
            id=g.id,
            goal=g.original_goal,
            model=g.model_used or "Multi-Agent",
            date=g.updated_at or g.created_at,
            preview=g.breakdown if g.breakdown else [],
            thinking=g.thinking_process,
            chat_history=g.chat_history or []
        ) for g in goals
    ]

@router.post("/goals/{user_id}")
async def create_goal(user_id: str, req: SaveGoalRequest, db: AsyncSession = Depends(get_db)):
    new_goal = Goal(
        user_id=user_id,
        original_goal=req.title,
        chat_history=req.chat_history,
        breakdown=req.preview,
        model_used="Multi-Agent",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_goal)
    await db.commit()
    await db.refresh(new_goal)
    return {"id": new_goal.id, "message": "Goal saved"}

@router.put("/goals/{goal_id}")
async def update_goal(goal_id: int, req: SaveGoalRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal.chat_history = req.chat_history
    goal.original_goal = req.title
    if req.preview:
        goal.breakdown = req.preview
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
    return StreamingResponse(
        ai_service.stream_chat(req.messages, req.model),
        media_type="text/plain"
    )