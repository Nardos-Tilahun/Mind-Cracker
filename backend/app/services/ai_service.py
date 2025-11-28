import httpx
import json
import asyncio
import re
import random
import logging
import sys # <--- CRITICAL FOR DOCKER LOGS
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

# Setup Logger to flush immediately to stdout
logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("ai_service")

SYSTEM_PROMPT = """
You are 'The Smart Goal Breaker', a strategic AI agent.
MANDATORY PROTOCOL:
1. First, you MUST think about the user's request. Output your thinking inside <think>...</think> tags.
2. After thinking, you MUST output a VALID JSON object.
"""

SLOGAN_PROMPT = """
Generate exactly 50 distinct, creative, and highly specific slogans for a goal-planning AI.
Format: A raw JSON Array of objects with keys: "headline", "subtext", "example".
Output strictly raw JSON. No markdown.
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
            "messages": [{"role": "user", "content": f"Create a title: {context}"}],
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
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 100000))}],
            "stream": False
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content'].replace("```json", "").replace("```", "").strip()
                    match = re.search(r'\[.*\]', content, re.DOTALL)
                    if match:
                        return [SloganItem(**i) for i in json.loads(match.group(0))]
            except Exception:
                pass
        return FALLBACK_SLOGANS

    async def stream_chat(self, messages: List[ChatMessage], model: str) -> AsyncGenerator[bytes, None]:
        # Clean input
        valid_msgs = [m.dict() for m in messages if m.content.strip()]

        payload = {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + valid_msgs,
            "stream": True,
            "temperature": 0.6,
            "max_tokens": 2000
        }

        # --- DEBUG LOGS (Force Flush) ---
        print(f"\n🚀 [BACKEND] STARTING STREAM for model: {model}", flush=True)
        # --------------------------------

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:

                    if response.status_code != 200:
                        error_body = await response.aread()
                        error_text = error_body.decode('utf-8')
                        
                        # --- PRINT ERROR TO CONSOLE ---
                        print(f"❌ [BACKEND ERROR] Status: {response.status_code}", flush=True)
                        print(f"❌ [BACKEND ERROR] Body: {error_text}", flush=True)
                        
                        # Send detailed error to frontend so it knows not to retry blindly
                        yield f"Error: {response.status_code} - {error_text}".encode("utf-8")
                        return

                    print(f"✅ [BACKEND] Connection Established. Streaming...", flush=True)

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
                print(f"🔥 [BACKEND EXCEPTION] {str(e)}", flush=True)
                yield b"Error: Connection failed."

ai_service = AIService()