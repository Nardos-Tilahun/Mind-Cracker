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

# --- CONFIGURATION: ROBUST FREE MODEL LIST (Updated 2025) ---
# These are exact IDs known to be free and generally available.
PREFERRED_ORDER = [
    # 1. Google Gemini (Fastest, High Context)
    {"name": "Gemini 2.0 Flash Lite", "keywords": ["gemini", "flash", "lite", "free"], "id": "google/gemini-2.0-flash-lite-preview-02-05:free"},
    {"name": "Gemini 2.0 Flash Exp", "keywords": ["gemini", "flash", "exp", "free"], "id": "google/gemini-2.0-flash-exp:free"},
    
    # 2. Meta Llama (Reliable, Good Logic)
    {"name": "Llama 3.3 70B", "keywords": ["llama", "3.3", "70b", "free"], "id": "meta-llama/llama-3.3-70b-instruct:free"},
    
    # 3. DeepSeek (Great for reasoning)
    {"name": "DeepSeek R1 Distill", "keywords": ["deepseek", "r1", "free"], "id": "deepseek/deepseek-r1-distill-llama-70b:free"},
    
    # 4. Qwen (Good for coding/structure)
    {"name": "Qwen 2.5 Coder 32B", "keywords": ["qwen", "coder", "free"], "id": "qwen/qwen-2.5-coder-32b-instruct:free"},
    
    # 5. Nvidia (Backup)
    {"name": "Nvidia Llama 3.1", "keywords": ["nvidia", "llama", "free"], "id": "nvidia/llama-3.1-nemotron-70b-instruct:free"},
]

# Global cache
model_cache = {
    "data": [],
    "timestamp": 0
}

async def fetch_valid_openrouter_models():
    # 1. Use Cache if fresh (10 minutes)
    now = datetime.utcnow().timestamp()
    if model_cache["data"] and (now - model_cache["timestamp"] < 600):
        return model_cache["data"]

    print("🔄 [MODELS] Fetching fresh list from OpenRouter...", flush=True)

    available_models = []
    
    # Define a default safe list in case API fails entirely
    safe_list = [
        ModelInfo(id=p["id"], name=p["name"], provider=p["id"].split("/")[0].title(), context_length=128000)
        for p in PREFERRED_ORDER
    ]

    # 2. Fetch from API
    api_key = settings.openrouter_keys[0] if settings.openrouter_keys else ""
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])

                # 3. Filter for likely "Free" models
                for m in data:
                    mid = m.get("id", "")
                    pricing = m.get("pricing", {})
                    # Strict check: ID ends in :free OR explicit 0 pricing
                    is_free = mid.endswith(":free") or (
                        str(pricing.get("prompt")) == "0" and str(pricing.get("completion")) == "0"
                    )

                    if is_free:
                        available_models.append(mid)

                print(f"✅ [MODELS] Found {len(available_models)} free models via API.", flush=True)
            else:
                print(f"⚠️ [MODELS] API returned {resp.status_code}. Using hardcoded list.", flush=True)
                return safe_list

    except Exception as e:
        print(f"❌ [MODELS] Fetch failed: {e}. Using hardcoded safe list.", flush=True)
        return safe_list

    # 4. Map Preferences to Actual IDs found
    final_list = []
    used_ids = set()

    # Priority 1: Add our Preferred models if they exist in the API list OR just add them anyway (safest)
    for slot in PREFERRED_ORDER:
        # We explicitly trust our hardcoded IDs because OpenRouter API listing can be laggy
        final_list.append(ModelInfo(
            id=slot["id"],
            name=slot["name"],
            provider=slot["id"].split("/")[0].title(),
            context_length=128000
        ))
        used_ids.add(slot["id"])

    # Priority 2: Add other free models found that aren't in our preferred list
    for mid in available_models:
        if mid not in used_ids and "lzlv" not in mid and "mythomax" not in mid: # Filter out some niche ones to keep UI clean
            provider = mid.split("/")[0].replace("-", " ").title()
            final_list.append(ModelInfo(
                id=mid,
                name=mid.split("/")[-1].replace(":free", "").replace("-", " ").title(),
                provider=provider,
                context_length=8192
            ))
            used_ids.add(mid)
            # Limit to 10 extra models
            if len(final_list) >= 15: break

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