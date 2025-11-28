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

# --- UPDATED PROMPT: ENFORCING SHORT & PUNCHY SLOGANS ---
SLOGAN_PROMPT = """
Generate exactly 50 distinct, creative, and highly specific slogans for a goal-planning AI.
Random Seed: {seed}

CRITERIA:
1. **HEADLINE:** MUST be Ultra-Short (2-5 words MAX). Punchy. Impactful. (e.g., "Build It Now", "Code Your Future").
2. **SUBTEXT:** One short sentence. Action-oriented.
3. **EXAMPLE:** Highly specific goal (e.g., "Learn Python in 30 Days", "Train for a Half Marathon").

Format: A raw JSON Array of objects with keys: "headline", "subtext", "example".
Do NOT write "Here is the JSON" or use markdown code blocks. Just return the array.
"""

FALLBACK_SLOGANS = [
    SloganItem(headline="Action Over Anxiety", subtext="Stop overthinking. Get a plan.", example="Launch a Podcast"),
    SloganItem(headline="Complexity Killer", subtext="We eat big goals for breakfast.", example="Learn Japanese"),
    SloganItem(headline="The Blueprint Engine", subtext="Your ambition, architected.", example="Build a Tiny House"),
    SloganItem(headline="Zero to One", subtext="The fastest path from execution.", example="Write a Novel")
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
            # Using Gemini Flash 2.0 as it's fast and follows length constraints well
            "model": "google/gemini-2.0-flash-exp:free", 
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 100000))}],
            "stream": False,
            "temperature": 1.0
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content']
                    # Clean up markdown if present
                    content = content.replace("```json", "").replace("```", "").strip()
                    
                    match = re.search(r'\[.*\]', content, re.DOTALL)
                    if match:
                        data = json.loads(match.group(0))
                        return [SloganItem(**i) for i in data]
            except Exception as e:
                logger.error(f"Slogan generation failed: {e}")
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

        print(f"🚀 [BACKEND] Sending request for model: {model}")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:

                    if response.status_code != 200:
                        error_body = await response.aread()
                        print(f"❌ [BACKEND ERROR] Status: {response.status_code}")
                        print(f"❌ [BACKEND ERROR] Body: {error_body.decode('utf-8')}")
                        yield f"Error: {response.status_code} - OpenRouter says: {error_body.decode('utf-8')}".encode("utf-8")
                        return

                    print(f"✅ [BACKEND SUCCESS] Stream started for {model}")

                    buffer = ""
                    async for chunk in response.aiter_bytes():
                        buffer += chunk.decode("utf-8", errors="ignore")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            if line.startswith("data: ") and line != "data: [DONE]":
                                try:
                                    data = json.loads(line[6:])
                                    content = data['choices'][0]['delta'].get('content', '')
                                    if content: yield content.encode('utf-8')
                                except Exception: pass
                        await asyncio.sleep(0)

            except Exception as e:
                print(f"🔥 [BACKEND EXCEPTION] {str(e)}")
                yield b"Error: Connection failed."

ai_service = AIService()