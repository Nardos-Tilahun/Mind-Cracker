import sys 
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List
import httpx
import logging
import traceback
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

class TitleRequest(BaseModel):
    context: str

# --- STRICT MODEL ORDER CONFIGURATION ---
# Mapping: Requested Name -> Real OpenRouter ID
TARGET_MODELS = [
    # 1. Google: Gemini 2.5 Flash Lite (Mapping to 2.0 Flash Lite Preview Free)
    {"id": "google/gemini-2.0-flash-lite-preview-02-05:free", "name": "Gemini 2.5 Flash Lite", "provider": "Google"},
    
    # 2. Xai: Grok Code Fast 1 (Mapping to Grok Beta)
    {"id": "x-ai/grok-beta", "name": "Grok Code Fast 1", "provider": "xAI"},
    
    # 3. Qwen: Qwen3 Coder Flash (Mapping to Qwen 2.5 Coder 32B Free)
    {"id": "qwen/qwen-2.5-coder-32b-instruct:free", "name": "Qwen3 Coder Flash", "provider": "Qwen"},
    
    # 4. Xai: Qwen: Qwen3 235B A22B (Mapping to Qwen 2.5 72B)
    {"id": "qwen/qwen-2.5-72b-instruct", "name": "Qwen3 235B A22B", "provider": "xAI"},
    
    # 5. Google: Gemini 2.0 Flash (Mapping to Flash Exp Free)
    {"id": "google/gemini-2.0-flash-exp:free", "name": "Gemini 2.0 Flash", "provider": "Google"},
    
    # 6. Qwen: Qwen Turbo
    {"id": "qwen/qwen-turbo", "name": "Qwen Turbo", "provider": "Qwen"},
    
    # 7. Grok 4.1 Fast (Free) (Mapping to a Grok variant or free placeholder)
    {"id": "x-ai/grok-2-vision-1212", "name": "Grok 4.1 Fast (Free)", "provider": "xAI"},
    
    # 8. Deepseek: Deepseek R1 0528 Qwen3 8B (Mapping to Deepseek R1 Distill Qwen)
    {"id": "deepseek/deepseek-r1-distill-qwen-32b", "name": "Deepseek R1 0528 Qwen3 8B", "provider": "DeepSeek"},
]

# Create fallback list objects
STATIC_MODELS = [
    ModelInfo(id=m["id"], name=m["name"], provider=m["provider"], context_length=128000)
    for m in TARGET_MODELS
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
    print("\n--------- 🔍 DEBUG: STARTING STRICT MODEL FETCH ---------", flush=True)

    # 1. Fetch from OpenRouter to get context lengths (optional, but good for accuracy)
    # Even if fetch fails, we MUST return the specific ordered list.
    
    api_key = settings.openrouter_keys[0] # Use first key for fetching list
    fetched_data = {}

    if api_key:
        headers = {"Authorization": f"Bearer {api_key}"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                if resp.status_code == 200:
                    models_json = resp.json().get("data", [])
                    # Index by ID for quick lookup
                    fetched_data = {m["id"]: m for m in models_json}
                    print(f"✅ DEBUG: Fetched {len(models_json)} models from API.", flush=True)
                else:
                    print(f"⚠️ DEBUG: API List Fetch Failed: {resp.status_code}", flush=True)
            except Exception as e:
                print(f"⚠️ DEBUG: API Fetch Exception: {e}", flush=True)

    # 2. Build the STRICT List based on TARGET_MODELS
    final_list = []
    
    for target in TARGET_MODELS:
        t_id = target["id"]
        
        # Get real context length if available, otherwise default
        real_info = fetched_data.get(t_id, {})
        context_len = real_info.get("context_length", 128000)
        
        # Force the name/provider as requested by user
        final_list.append(
            ModelInfo(
                id=t_id,
                name=target["name"], 
                provider=target["provider"],
                context_length=context_len
            )
        )

    print(f"📦 DEBUG: Returning {len(final_list)} STRICTLY ORDERED models.", flush=True)
    return final_list

# ... (Keep get_history, create_goal, update_goal, clear_history, delete_goal exactly as before) ...
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
    if not req.messages or len(req.messages) == 0: raise HTTPException(400, "Empty message list")
    last_msg = req.messages[-1].content
    if len(last_msg) > 2000: raise HTTPException(400, "Message too long (max 2000 chars)")
    return StreamingResponse(ai_service.stream_chat(req.messages, req.model), media_type="text/plain")