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

# Fallback slogans in case all keys fail
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
        """Get headers using the current active key"""
        if not self.keys:
            return {}
        key = self.keys[self.current_key_index]
        masked = f"{key[:6]}...{key[-4:]}"
        # print(f"🔑 [AI SERVICE] Using Key Index {self.current_key_index}: {masked}", flush=True)
        return {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://goalbreaker.app",
            "X-Title": "Goal Breaker",
            "Content-Type": "application/json"
        }

    def _rotate_key(self) -> bool:
        """Rotates to the next key. Returns False if all keys exhausted."""
        prev_index = self.current_key_index
        self.current_key_index = (self.current_key_index + 1) % len(self.keys)
        
        print(f"🔄 [AI SERVICE] Switching Key: {prev_index} -> {self.current_key_index}", flush=True)
        
        # If we looped back to 0, we've tried them all for this specific attempt loop
        if self.current_key_index == 0:
            return False 
        return True

    async def generate_title(self, context: str) -> str:
        # Using Google Flash as it's usually free and fast
        payload = {
            "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
            "messages": [{"role": "user", "content": f"Create a short title: {context}"}],
            "max_tokens": 50
        }
        
        # Simple retry logic for title generation
        attempts = 0
        max_attempts = len(self.keys)

        async with httpx.AsyncClient(timeout=10.0) as client:
            while attempts < max_attempts:
                try:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    if resp.status_code == 200:
                        return resp.json()['choices'][0]['message']['content'].strip('"\'')
                    elif resp.status_code in [429, 402]:
                        print(f"⚠️ [TITLE GEN] Key exhausted ({resp.status_code}). Rotating...", flush=True)
                        if not self._rotate_key(): break
                    else:
                        break # Other error, don't retry
                except Exception:
                    pass
                attempts += 1
                
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        payload = {
            "model": "google/gemini-2.0-flash-exp:free",
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 100000))}],
            "stream": False
        }
        
        attempts = 0
        max_attempts = len(self.keys)

        async with httpx.AsyncClient(timeout=15.0) as client:
            while attempts < max_attempts:
                try:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
                    
                    if resp.status_code == 200:
                        content = resp.json()['choices'][0]['message']['content'].replace("```json", "").replace("```", "").strip()
                        match = re.search(r'\[.*\]', content, re.DOTALL)
                        if match:
                            return [SloganItem(**i) for i in json.loads(match.group(0))]
                    elif resp.status_code in [429, 402]:
                        print(f"⚠️ [SLOGANS] Key exhausted ({resp.status_code}). Rotating...", flush=True)
                        if not self._rotate_key(): break
                    else:
                        break
                except Exception:
                    pass
                attempts += 1
        
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

        # Track how many keys we've tried
        keys_tried = 0
        total_keys = len(self.keys)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            
            while keys_tried < total_keys:
                print(f"🚀 [STREAM] Attempting model {model} with Key Index {self.current_key_index}", flush=True)
                
                try:
                    async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload) as response:

                        # 1. Rate Limit / Payment Error -> ROTATE AND RETRY
                        if response.status_code in [429, 402]:
                            error_text = (await response.aread()).decode('utf-8')
                            print(f"⚠️ [STREAM] Key Failed ({response.status_code}): {error_text}", flush=True)
                            
                            # Rotate key
                            self._rotate_key()
                            keys_tried += 1
                            continue # Loop back and try next key

                        # 2. Other Error (e.g. 400 Bad Request, 404 Model Not Found) -> FAIL PERMANENTLY
                        if response.status_code != 200:
                            error_text = (await response.aread()).decode('utf-8')
                            print(f"❌ [STREAM] Fatal Error ({response.status_code}): {error_text}", flush=True)
                            yield f"Error: {response.status_code} - {error_text}".encode("utf-8")
                            return

                        # 3. Success -> STREAM DATA
                        print(f"✅ [STREAM] Connection Established. Streaming...", flush=True)
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
                        
                        # If we finished streaming successfully, break the key rotation loop
                        return 

                except Exception as e:
                    print(f"🔥 [STREAM EXCEPTION] {str(e)}", flush=True)
                    # For network exceptions, we might want to retry, but for now let's just rotate
                    self._rotate_key()
                    keys_tried += 1
            
            # If we exit the loop, it means all keys failed
            yield b"Error: 429 - Daily Limit Reached. All available API keys have been exhausted."

ai_service = AIService()