import httpx
import json
import asyncio
import re
import random
import logging
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

# Setup Logger
logger = logging.getLogger("uvicorn.error")

SYSTEM_PROMPT = """
You are 'The Smart Goal Breaker', a strategic agent.

PROTOCOL:
1. CLASSIFY INPUT:
   - Is it a GREETING? -> FAST PATH.
   - Is it a GOAL? -> DEEP PATH.

2. FAST PATH:
   - DO NOT use <think> tags.
   - Return: { "message": "I am the Goal Breaker..." }

3. DEEP PATH:
   - First, use <think> tags to analyze. 
   - CRITICAL: Keep reasoning CONCISE and SHORT. Do not over-analyze.
   - Then, return JSON with exactly 5 Actionable Steps.

4. JSON STRUCTURE:
   {
     "title": "Short Title",
     "steps": [
       { "step": "Step Name", "complexity": 5, "description": "Details." }
     ]
   }
"""

SLOGAN_PROMPT = """
Generate exactly 20 distinct slogans for an AI goal-breakdown tool.
Random Seed: {seed}
Format: JSON Array of objects with keys: headline, subtext, example.
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
            "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
            "messages": [{"role": "user", "content": SLOGAN_PROMPT.format(seed=random.randint(1, 10000))}],
            "stream": False,
            "temperature": 1.0
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content']
                    match = re.search(r'\[.*\]', content, re.DOTALL)
                    if match:
                        return [SloganItem(**i) for i in json.loads(match.group(0))][:20]
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

        # Fix for DeepSeek specific constraints
        if "deepseek" in model and "r1" in model:
             # DeepSeek R1 often rejects 'system' roles in strict mode or requires no temp
             # We rely on the frontend fallback if this 400s
             pass 

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:
                    
                    # If error, return specific flag so Frontend knows to switch
                    if response.status_code != 200:
                        logger.warning(f"Model {model} failed: {response.status_code}")
                        yield f"Error: {response.status_code} Service unavailable.".encode("utf-8")
                        return

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
                logger.error(f"Stream exception: {str(e)}")
                yield b"Error: Connection failed."

ai_service = AIService()