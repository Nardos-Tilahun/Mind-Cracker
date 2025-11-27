import httpx
import json
import asyncio
import re
import random
import logging
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

logger = logging.getLogger("uvicorn.error")

SYSTEM_PROMPT = """
You are 'The Smart Goal Breaker', a strategic AI agent.
MANDATORY PROTOCOL:
1. First, you MUST think about the user's request. Output your thinking inside <think>...</think> tags.
2. After thinking, you MUST output a VALID JSON object.
"""

# --- UPDATED PROMPT: Request 50 DISTINCT & UNUSUAL items ---
SLOGAN_PROMPT = """
Generate exactly 50 distinct, creative, and highly specific slogans/examples for a goal-planning AI.
Random Seed: {seed}

CRITERIA:
1. **Headline:** Catchy, 2-4 words.
2. **Subtext:** Motivational, action-oriented.
3. **Example:** MUST be specific. Do NOT use generic goals like "Lose weight" or "Learn coding".
   - GOOD: "Build a Hydroponic Garden", "Memorize Pi to 100 digits", "Cycle across Vietnam", "Brew the perfect Espresso".
   - BAD: "Get fit", "Save money", "Travel more".

Format: A raw JSON Array of objects with keys: "headline", "subtext", "example".
Do NOT write "Here is the JSON" or use markdown code blocks. Just return the array.
"""

# --- FALLBACKS (Used ONLY if API fails) ---
FALLBACK_SLOGANS = [
    SloganItem(headline="Action Over Anxiety", subtext="Stop overthinking. Get a plan.", example="Launch a Podcast"),
    SloganItem(headline="Complexity Killer", subtext="We eat big goals for breakfast.", example="Learn Japanese"),
    SloganItem(headline="The Blueprint Engine", subtext="Your ambition, architected.", example="Build a Tiny House"),
    SloganItem(headline="Zero to One", subtext="The fastest path from execution.", example="Write a Sci-Fi Novel")
]

class AIService:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://goalbreaker.app",
            "X-Title": "Goal Breaker",
            "Content-Type": "application/json"
        }
        self.timeout = httpx.Timeout(45.0, connect=5.0)

    async def generate_title(self, context: str) -> str:
        payload = {
            "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
            "messages": [
                {"role": "system", "content": "Create a concise title (max 6 words). Return ONLY text."},
                {"role": "user", "content": f"Context:\n{context}"}
            ],
            "stream": False,
            "max_tokens": 50
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    return resp.json()['choices'][0]['message']['content'].strip('"\'')
            except Exception:
                pass
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        payload = {
            # Use a model known for following formatting instructions well
            "model": "google/gemini-2.0-flash-exp:free", 
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 999999))}],
            "stream": False,
            "temperature": 1.0 # Max creativity
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content']
                    
                    # --- ROBUST PARSING FIX ---
                    # 1. Strip Markdown Code Blocks
                    content = content.replace("```json", "").replace("```", "").strip()
                    
                    # 2. Find the array brackets
                    match = re.search(r'\[.*\]', content, re.DOTALL)
                    if match:
                        clean_json = match.group(0)
                        data = json.loads(clean_json)
                        return [SloganItem(**i) for i in data]
                    else:
                        logger.error(f"Slogan Parse Error: No JSON array found.")
                else:
                    logger.error(f"Slogan API Error: {resp.status_code}")

            except Exception as e:
                logger.error(f"Slogan Generation Exception: {e}")
                pass
        
        return FALLBACK_SLOGANS

    async def stream_chat(self, messages: List[ChatMessage], model: str) -> AsyncGenerator[bytes, None]:
        valid_msgs = [m.dict() for m in messages if m.content.strip()]
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + valid_msgs,
            "stream": True,
            "temperature": 0.6,
            "max_tokens": 2000
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:
                    if response.status_code != 200:
                        yield f"Error: {response.status_code}".encode("utf-8")
                        return
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except Exception:
                yield b"Error: Connection failed."

ai_service = AIService()