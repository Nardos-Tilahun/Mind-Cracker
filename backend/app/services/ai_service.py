import httpx
import json
import asyncio
import re
import random
import logging
import sys
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("ai_service")

# --- PROMPT ---
SYSTEM_PROMPT = """
You are 'The Smart Goal Breaker', a strategic AI agent.
Your mission is to break down the user's goal into EXACTLY 5 actionable steps.

RESPONSE PROTOCOL:
1. First, engage in a strategic reasoning process. Analyze the user's goal. Enclose reasoning within <think> tags.
2. Then, output the plan as VALID JSON.

OUTPUT FORMAT:
<think>
[Internal strategy]
</think>
{
  "message": "Brief motivating summary.",
  "steps": [
    { "step": "Step 1 Title", "description": "Details", "complexity": 3 },
    { "step": "Step 2 Title", "description": "Details", "complexity": 5 },
    { "step": "Step 3 Title", "description": "Details", "complexity": 8 },
    { "step": "Step 4 Title", "description": "Details", "complexity": 6 },
    { "step": "Step 5 Title", "description": "Details", "complexity": 9 }
  ]
}
Complexity is 1-10. No markdown blocks.
"""

FALLBACK_SLOGANS = [
    SloganItem(headline="Action Over Anxiety", subtext="Stop overthinking. Get a plan.", example="Launch a Podcast"),
    SloganItem(headline="Complexity Killer", subtext="We eat big goals for breakfast.", example="Learn Japanese"),
    SloganItem(headline="The Blueprint Engine", subtext="Your ambition, architected.", example="Build a Tiny House"),
    SloganItem(headline="Zero to One", subtext="The fastest path from execution.", example="Write a Novel")
]

class AIService:
    def __init__(self):
        self.key = settings.GROQ_API_KEY
        self.timeout = httpx.Timeout(30.0, connect=10.0)
        print(f"🔧 [AI SERVICE] Initialized with Groq API.", flush=True)

    def _get_headers(self):
        return {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }

    async def generate_title(self, context: str) -> str:
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": f"Create a short title (max 5 words) for: {context}"}],
            "max_tokens": 50
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=self._get_headers(), json=payload)
                if resp.status_code == 200:
                    return resp.json()['choices'][0]['message']['content'].strip('"\'')
        except Exception:
            pass
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        return FALLBACK_SLOGANS

    async def stream_chat(self, messages: List[ChatMessage], model: str) -> AsyncGenerator[bytes, None]:
        valid_msgs = [m.dict() for m in messages if m.content.strip()]
        
        # SAFETY: If model contains "8b", limit tokens to prevent overflow on smaller models
        # Otherwise use 4096 for 70B models
        max_tokens = 1024 if "8b" in model.lower() else 4096
        
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + valid_msgs,
            "stream": True,
            "temperature": 0.6,
            "max_tokens": max_tokens
        }

        print(f"🚀 [STREAM] Sending request to Groq ({model})...", flush=True)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", "https://api.groq.com/openai/v1/chat/completions", headers=self._get_headers(), json=payload) as response:
                    
                    if response.status_code != 200:
                        error_body = (await response.aread()).decode('utf-8')
                        print(f"❌ [STREAM ERROR] Status: {response.status_code} | Body: {error_body}", flush=True)
                        yield f"Error: {response.status_code} - {error_body}".encode("utf-8")
                        return

                    print(f"✅ [STREAM] Connected! Groq is streaming...", flush=True)
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line.replace("data: ", "").strip()
                            if data_str == "[DONE]":
                                break
                            
                            try:
                                data_json = json.loads(data_str)
                                delta = data_json.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                
                                if content:
                                    yield content.encode("utf-8")
                            except Exception:
                                continue
            
            except Exception as e:
                print(f"🔥 [STREAM EXCEPTION] {str(e)}", flush=True)
                yield b"Error: Connection Failed"

ai_service = AIService()