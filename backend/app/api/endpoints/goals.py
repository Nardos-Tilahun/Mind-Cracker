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

# --- CONFIGURATION: The User's Desired "Slots" ---
# We will try to find a valid free model for each of these slots dynamically.
PREFERRED_ORDER = [
    {"name": "Gemini 2.5 Flash Lite", "keywords": ["gemini", "flash", "lite", "free"], "fallback": "google/gemini-2.0-flash-lite-preview-02-05:free"},
    {"name": "Grok Code Fast",       "keywords": ["grok", "code", "free"], "fallback": "meta-llama/llama-3.3-70b-instruct:free"}, # Grok usually isn't free, fallback to Llama 3.3
    {"name": "Qwen 2.5 Coder",       "keywords": ["qwen", "coder", "free"], "fallback": "qwen/qwen-2.5-coder-32b-instruct:free"},
    {"name": "Qwen Turbo",           "keywords": ["qwen", "turbo", "free"], "fallback": "qwen/qwen-turbo"},
    {"name": "Gemini 2.0 Flash",     "keywords": ["gemini", "flash", "exp", "free"], "fallback": "google/gemini-2.0-flash-exp:free"},
    {"name": "DeepSeek R1",          "keywords": ["deepseek", "r1", "free"], "fallback": "deepseek/deepseek-r1:free"},
    {"name": "Mistral Small",        "keywords": ["mistral", "small", "free"], "fallback": "mistralai/mistral-small-24b-instruct-2501:free"},
]

# Global cache for models to avoid hitting OpenRouter on every page load
model_cache = {
    "data": [],
    "timestamp": 0
}

async def fetch_valid_openrouter_models():
    """
    Fetches ALL models from OpenRouter, filters for FREE ones, 
    and maps them to our preferred slots.
    """
    # 1. Use Cache if fresh (5 minutes)
    now = datetime.utcnow().timestamp()
    if model_cache["data"] and (now - model_cache["timestamp"] < 300):
        return model_cache["data"]

    print("🔄 [MODELS] Fetching fresh list from OpenRouter...", flush=True)
    
    # 2. Fetch from API
    api_key = settings.openrouter_keys[0] if settings.openrouter_keys else ""
    headers = {"Authorization": f"Bearer {api_key}"}
    
    available_models = []
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                
                # 3. Filter for likely "Free" models
                # OpenRouter API 'pricing' field: prompt/completion should be '0'
                # Or check IDs ending in ':free'
                for m in data:
                    mid = m.get("id", "")
                    pricing = m.get("pricing", {})
                    is_free = mid.endswith(":free") or (
                        pricing.get("prompt") == "0" and pricing.get("completion") == "0"
                    )
                    
                    if is_free:
                        available_models.append(mid)
                
                print(f"✅ [MODELS] Found {len(available_models)} free models available.", flush=True)
    except Exception as e:
        print(f"❌ [MODELS] Fetch failed: {e}", flush=True)
        # On failure, return fallbacks immediately
        return [ModelInfo(id=p["fallback"], name=p["name"], provider="Fallback", context_length=4096) for p in PREFERRED_ORDER]

    # 4. Map Preferences to Actual IDs
    final_list = []
    used_ids = set()

    for slot in PREFERRED_ORDER:
        best_match = None
        
        # Try to find a match in available_models containing ALL keywords
        for mid in available_models:
            if mid in used_ids: continue
            
            # Check if all keywords exist in the model ID
            if all(kw in mid.lower() for kw in slot["keywords"]):
                best_match = mid
                break
        
        # If strict match failed, try looser match (any 2 keywords)
        if not best_match:
             for mid in available_models:
                if mid in used_ids: continue
                matches = sum(1 for kw in slot["keywords"] if kw in mid.lower())
                if matches >= 2:
                    best_match = mid
                    break

        # Fallback if still not found
        final_id = best_match if best_match else slot["fallback"]
        used_ids.add(final_id)

        # Provider Name formatting
        provider = final_id.split("/")[0].replace("-", " ").title()
        
        final_list.append(ModelInfo(
            id=final_id,
            name=slot["name"], # Keep user's preferred display name
            provider=provider,
            context_length=128000 # Assume high context for modern models
        ))

    # Update Cache
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
    """
    Returns the strict ordered list, but with valid IDs dynamically resolved.
    """
    return await fetch_valid_openrouter_models()

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