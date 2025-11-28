import httpx
import json
import asyncio
import re
import random
import logging
import sys
import traceback
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

# Setup Logger
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
        self.keys = settings.openrouter_keys
        self.current_key_index = 0
        self.timeout = httpx.Timeout(45.0, connect=10.0)
        print(f"🔧 [AI SERVICE] Initialized with {len(self.keys)} API Keys.", flush=True)

    def _get_headers(self):
        if not self.keys: return {}
        key = self.keys[self.current_key_index]
        return {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://goalbreaker.app",
            "X-Title": "Goal Breaker",
            "Content-Type": "application/json"
        }

    def _rotate_key(self) -> bool:
        if not self.keys or len(self.keys) <= 1: return False
        prev = self.current_key_index
        self.current_key_index = (self.current_key_index + 1) % len(self.keys)
        print(f"🔄 [AI SERVICE] Switching Key: {prev} -> {self.current_key_index}", flush=True)
        return self.current_key_index != 0

    async def generate_title(self, context: str) -> str:
        # Use a very stable free model for titles
        payload = {
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": f"Create a title: {context}"}],
            "max_tokens": 50
        }
        
        for _ in range(len(self.keys) + 1):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    if resp.status_code == 200:
                        return resp.json()['choices'][0]['message']['content'].strip('"\'')
                    elif resp.status_code in [429, 402, 503]:
                        if not self._rotate_key(): break
            except Exception:
                pass
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        payload = {
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 100000))}],
            "stream": False
        }
        
        for _ in range(len(self.keys) + 1):
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    if resp.status_code == 200:
                        content = resp.json()['choices'][0]['message']['content'].replace("```json", "").replace("```", "").strip()
                        match = re.search(r'\[.*\]', content, re.DOTALL)
                        if match: return [SloganItem(**i) for i in json.loads(match.group(0))]
                    elif resp.status_code in [429, 402]:
                        if not self._rotate_key(): break
            except Exception:
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

        keys_tried = 0
        max_tries = len(self.keys) * 2 # Try cycling through twice just in case

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            while keys_tried < max_tries:
                print(f"🚀 [STREAM] Attempting model {model} with Key Index {self.current_key_index}", flush=True)
                
                try:
                    async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload) as response:
                        
                        # Handle known "bad key" or "rate limit" codes
                        if response.status_code in [429, 402, 401, 403]:
                            err = (await response.aread()).decode('utf-8')
                            print(f"⚠️ [STREAM] Key Failed ({response.status_code}): {err}", flush=True)
                            self._rotate_key()
                            keys_tried += 1
                            continue

                        # Handle "Model Not Found" (404) or "Bad Request" (400)
                        # This usually means the model ID is invalid. Rotating keys won't help.
                        if response.status_code in [404, 400]:
                            err = (await response.aread()).decode('utf-8')
                            print(f"❌ [STREAM] Fatal Model Error ({response.status_code}): {err}", flush=True)
                            yield f"Error: {response.status_code} - Model ID Invalid".encode("utf-8")
                            return

                        if response.status_code != 200:
                            err = (await response.aread()).decode('utf-8')
                            yield f"Error: {response.status_code} - {err}".encode("utf-8")
                            return

                        print(f"✅ [STREAM] Connected.", flush=True)
                        async for chunk in response.aiter_bytes():
                            yield chunk
                        return 

                except Exception as e:
                    print(f"🔥 [STREAM EXCEPTION] {str(e)}", flush=True)
                    self._rotate_key()
                    keys_tried += 1
            
            yield b"Error: 429 - All API keys exhausted or model unavailable."

ai_service = AIService()