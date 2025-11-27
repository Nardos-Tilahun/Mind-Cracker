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

# UPDATED PROMPT: Includes "visual_prompt" instruction
SYSTEM_PROMPT = """
You are 'The Smart Goal Breaker', a strategic AI agent.

MANDATORY PROTOCOL:
1. First, you MUST think about the user's request. Output your thinking inside <think>...</think> tags.
2. After thinking, you MUST output a VALID JSON object.

JSON STRUCTURE:
{
  "title": "Short Title",
  "message": "Brief encouragement.",
  "visual_prompt": "A highly detailed, artistic description of the final goal achieved (e.g., 'A futuristic eco-home with solar panels in a lush forest, cinematic lighting, 4k'). Keep it under 20 words. If the user asks for a diagram, describe a flowchart or visual structure.",
  "steps": [
    { "step": "Step 1", "complexity": 3, "description": "Details." },
    { "step": "Step 2", "complexity": 5, "description": "Details." },
    { "step": "Step 3", "complexity": 8, "description": "Details." },
    { "step": "Step 4", "complexity": 4, "description": "Details." },
    { "step": "Step 5", "complexity": 6, "description": "Final step details." }
  ]
}

RULES:
- "visual_prompt": MUST be included. It describes the Step 5 outcome as an image.
- Do NOT generate ASCII art. Just the description text.
- Ensure valid JSON.
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

        if "deepseek" in model and "r1" in model:
             pass 

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:
                    
                    if response.status_code != 200:
                        logger.warning(f"Model {model} failed: {response.status_code}")
                        yield f"Error: {response.status_code} Service unavailable.".encode("utf-8")
                        return

                    async for chunk in response.aiter_bytes():
                        buffer = chunk.decode("utf-8", errors="ignore")
                        # Simple splitting by lines for stream processing
                        lines = buffer.split("\n")
                        for line in lines:
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