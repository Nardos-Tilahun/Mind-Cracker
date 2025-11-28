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

# --- LOGGING SETUP ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

class TitleRequest(BaseModel):
    context: str

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
    print("\n--------- 🔍 DEBUG: STARTING MODEL FETCH ---------", flush=True)

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        print("❌ DEBUG: OPENROUTER_API_KEY is missing/empty!", flush=True)
        return FALLBACK_MODELS

    # Log masked key to verify it's the correct one
    masked_key = f"{api_key[:6]}...{api_key[-4:]}"
    print(f"🔑 DEBUG: API Key Loaded: {masked_key}", flush=True)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://goalbreaker.app",
        "X-Title": "Goal Breaker",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            print("⏳ DEBUG: Requesting OpenRouter models endpoint...", flush=True)

            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)

            print(f"📡 DEBUG: Response Status: {resp.status_code}", flush=True)

            if resp.status_code == 200:
                try:
                    data = resp.json().get("data", [])
                    print(f"✅ DEBUG: Successfully fetched {len(data)} models.", flush=True)

                    live_models = []
                    for m in data:
                        model_id = m.get("id", "")
                        if not model_id: continue

                        provider_raw = model_id.split("/")[0] if "/" in model_id else "Unknown"
                        provider_name = provider_raw.replace("-", " ").title()

                        live_models.append(
                            ModelInfo(
                                id=model_id,
                                name=m.get("name", model_id),
                                provider=provider_name,
                                context_length=m.get("context_length", 4096)
                            )
                        )

                    live_models.sort(key=lambda x: (x.provider, x.name))
                    returnKR = live_models if live_models else FALLBACK_MODELS
                    print(f"📦 DEBUG: Returning {len(returnKR)} processed models.", flush=True)
                    return returnKR

                except Exception as parse_error:
                    print(f"❌ DEBUG: JSON Parse Error: {parse_error}", flush=True)
                    print(f"❌ DEBUG: Raw content start: {resp.text[:100]}", flush=True)
            else:
                # IMPORTANT: Print the error body to see why it failed (e.g. 401 Unauthorized)
                print(f"❌ DEBUG: API Error Body: {resp.text}", flush=True)

        except Exception as e:
            print(f"🔥 DEBUG: EXCEPTION during model fetch: {str(e)}", flush=True)
            traceback.print_exc()

    print("⚠️ DEBUG: Returning Fallback Models due to failures.", flush=True)
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