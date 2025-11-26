from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import httpx
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.models.goal import Goal
from app.schemas.goal import StreamRequest, ModelInfo, HistoryItem, SaveGoalRequest, SloganResponse
from app.services.ai_service import ai_service
from pydantic import BaseModel

router = APIRouter()

class TitleRequest(BaseModel):
    context: str

# --- FALLBACK LIST (Safety Net) ---
# If OpenRouter API fails, we serve these so the UI doesn't break.
FALLBACK_MODELS = [
    ModelInfo(id="google/gemini-2.0-flash-lite-preview-02-05:free", name="Gemini 2.0 Flash Lite", provider="Google", context_length=1000000),
    ModelInfo(id="deepseek/deepseek-r1:free", name="DeepSeek R1", provider="DeepSeek", context_length=128000),
]

@router.post("/generate-title")
async def generate_title(req: TitleRequest):
    return {"title": await ai_service.generate_title(req.context)}

@router.get("/slogans", response_model=SloganResponse)
async def get_slogans(response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return {"slogans": await ai_service.generate_slogans()}

@router.get("/models", response_model=List[ModelInfo])
async def get_models():
    """
    Fetches models dynamically from OpenRouter.
    Falls back to a static list if the API call fails.
    """
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://goalbreaker.app", 
        "X-Title": "Goal Breaker",
    }
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                
                # Filter for high-quality free models to keep the UI clean
                filtered_models = [
                    ModelInfo(
                        id=m["id"], 
                        name=m["name"].split("/")[-1].replace("-", " ").title(), 
                        provider=m["name"].split("/")[0].title(), 
                        context_length=m.get("context_length", 4096)
                    ) 
                    for m in data 
                    if ":free" in m["id"]  # ONLY Free models
                ]
                
                # Sort by name for better UX
                return sorted(filtered_models, key=lambda x: x.name)
                
        except Exception as e:
            print(f"⚠️ OpenRouter Fetch Failed: {e}. Using fallback list.")
            pass
            
    # Return fallback if API fails
    return FALLBACK_MODELS

@router.get("/history/{user_id}", response_model=List[HistoryItem])
async def get_history(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.user_id == user_id).order_by(Goal.updated_at.desc()))
    return [
        HistoryItem(
            id=g.id, 
            goal=g.original_goal, 
            model=g.model_used or "Multi-Agent", 
            date=g.updated_at or g.created_at, 
            preview=g.breakdown or [], 
            thinking=g.thinking_process, 
            chat_history=g.chat_history or []
        ) for g in result.scalars().all()
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
    return StreamingResponse(
        ai_service.stream_chat(req.messages, req.model), 
        media_type="text/plain"
    )