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

class KeyManager:
    def __init__(self, keys: List[str]):
        self.keys = keys
        self.current_index = 0
        print(f"🔐 [KEY MANAGER] Loaded {len(keys)} API keys for rotation.", flush=True)

    def get_current_key(self) -> str:
        return self.keys[self.current_index]

    def rotate(self):
        if len(self.keys) > 1:
            prev = self.current_index
            self.current_index = (self.current_index + 1) % len(self.keys)
            print(f"🔄 [KEY MANAGER] Rotating key index: {prev} -> {self.current_index}", flush=True)
        else:
            print("⚠️ [KEY MANAGER] Rotation requested but only 1 key available.", flush=True)

class AIService:
    def __init__(self):
        self.key_manager = KeyManager(settings.openrouter_keys)
        self.timeout = httpx.Timeout(45.0, connect=10.0)

    def _get_headers(self):
        return {
            "Authorization": f"Bearer {self.key_manager.get_current_key()}",
            "HTTP-Referer": "https://goalbreaker.app",
            "X-Title": "Goal Breaker",
            "Content-Type": "application/json"
        }

    async def generate_title(self, context: str) -> str:
        payload = {
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": f"Create a title: {context}"}],
            "max_tokens": 50
        }
        
        # Simple retry logic for title
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    if resp.status_code == 200:
                        return resp.json()['choices'][0]['message']['content'].strip('"\'')
                    elif resp.status_code in [429, 402]:
                        self.key_manager.rotate()
            except Exception:
                pass
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        payload = {
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 100000))}],
            "stream": False
        }
        
        for attempt in range(len(self.key_manager.keys) + 1):
            async with httpx.AsyncClient(timeout=15.0) as client:
                try:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    
                    if resp.status_code == 200:
                        content = resp.json()['choices'][0]['message']['content'].replace("```json", "").replace("```", "").strip()
                        match = re.search(r'\[.*\]', content, re.DOTALL)
                        if match:
                            return [SloganItem(**i) for i in json.loads(match.group(0))]
                    elif resp.status_code in [429, 402]:
                        print(f"⚠️ [AI SERVICE] Slogan Rate Limit ({resp.status_code}). Rotating key...", flush=True)
                        self.key_manager.rotate()
                    else:
                        print(f"⚠️ [AI SERVICE] Slogan Failed: {resp.status_code}", flush=True)
                        break 
                except Exception:
                    traceback.print_exc()
        
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

        # RETRY LOOP FOR KEY ROTATION
        max_attempts = max(2, len(self.key_manager.keys))
        
        for attempt in range(max_attempts):
            print(f"\n🚀 [BACKEND] Stream Attempt {attempt+1}/{max_attempts} using key ending in ...{self.key_manager.get_current_key()[-4:]}", flush=True)
            
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload) as response:

                        if response.status_code in [429, 402]:
                            print(f"🛑 [BACKEND] Rate limit/Payment error ({response.status_code}). Rotating...", flush=True)
                            self.key_manager.rotate()
                            continue # Try next key

                        if response.status_code != 200:
                            error_body = await response.aread()
                            error_text = error_body.decode('utf-8')
                            print(f"❌ [BACKEND ERROR] Status: {response.status_code} | Body: {error_text}", flush=True)
                            
                            # If it's the last attempt, yield error
                            if attempt == max_attempts - 1:
                                yield f"Error: {response.status_code} - {error_text}".encode("utf-8")
                            return

                        # Successful connection
                        print(f"✅ [BACKEND] Stream Connected.", flush=True)
                        async for chunk in response.aiter_bytes():
                            buffer = chunk.decode("utf-8", errors="ignore")
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                if line.startswith("data: ") and line != "data: [DONE]":
                                    try:
                                        data = json.loads(line[6:])
                                        content = data['choices'][0]['delta'].get('content', '')
                                        if content: yield content.encode('utf-8')
                                    except Exception: pass
                            await asyncio.sleep(0)
                        return # Success, exit function

            except Exception as e:
                print(f"🔥 [BACKEND EXCEPTION] {str(e)}", flush=True)
                if attempt == max_attempts - 1:
                    yield f"Error: Connection failed - {str(e)}".encode("utf-8")
                # Otherwise loop continues

ai_service = AIService()