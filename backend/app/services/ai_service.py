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
You are 'The Smart Goal Breaker', a strategic AI planner.
Your mission is to break down goals into specific, actionable steps.

**CONTEXT:**
The user is navigating a hierarchical plan.
- If at the Root Level, breakdown the main goal.
- If at a Deeper Level (Step X.Y), breakdown that specific step further.

**STRICT RESPONSE PROTOCOL:**
1. **Thinking Phase**: Always start with deep strategic reasoning inside <think> tags. Plan the hierarchy before outputting JSON.
2. **JSON Phase**: Output valid, raw JSON only after the thinking tags.

**NAMING & STRUCTURE RULES:**
- **Step Titles**: Must be Action-Oriented (e.g., "Configure AWS VPC" not "AWS Configuration").
- **No Prefixing**: Do NOT include "Step 1" or numbers in the "step" title field. The UI handles numbering.
- **Complexity**: Rate 1-10 based on effort/time/skill required.

**OUTPUT FORMAT:**
<think>
(Reasoning about the goal, potential pitfalls, and logical flow...)
</think>
{
  "message": "A brief, encouraging summary of the strategy.",
  "steps": [
    {
      "step": "Descriptive Action Title",
      "description": "Specific instructions on how to execute this step.",
      "complexity": 5
    },
    ...
  ]
}
"""

FALLBACK_SLOGANS = [
    SloganItem(headline="Action Over Anxiety", subtext="Stop overthinking. Get a plan.", example="Launch a Podcast"),
    SloganItem(headline="Complexity Killer", subtext="We eat big goals for breakfast.", example="Learn Japanese"),
    SloganItem(headline="The Blueprint Engine", subtext="Your ambition, architected.", example="Build a Tiny House"),
    SloganItem(headline="Zero to One", subtext="The fastest path from execution.", example="Write a Novel")
]

class AIService:
    def __init__(self):
        # STRICTLY use Groq API Key
        self.key = settings.GROQ_API_KEY
        self.timeout = httpx.Timeout(45.0, connect=10.0)
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

        target_model = model
        # Intercept non-Groq models just in case
        if "/" in target_model or "gemini" in target_model.lower() or "claude" in target_model.lower() or "gpt" in target_model.lower():
            target_model = "llama-3.3-70b-versatile"

        model_chain = [target_model]
        # UPDATED: Added Mixtral and Llama 8B as sturdy fallbacks
        fallback_options = ["mixtral-8x7b-32768", "llama-3.1-8b-instant"]

        for m in fallback_options:
            if m not in model_chain and m != target_model:
                model_chain.append(m)

        print(f"🚀 [STREAM] Attempting chain: {model_chain}", flush=True)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt_model in model_chain:
                max_tokens = 1024 if "8b" in attempt_model.lower() or "9b" in attempt_model.lower() else 4096

                # Strict JSON mode (Groq supports this for Llama/Mixtral)
                payload = {
                    "model": attempt_model,
                    "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + valid_msgs,
                    "stream": True,
                    "temperature": 0.6,
                    "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"}
                }

                try:
                    print(f"🔄 [STREAM] Trying {attempt_model}...", flush=True)
                    async with client.stream("POST", "https://api.groq.com/openai/v1/chat/completions", headers=self._get_headers(), json=payload) as response:

                        if response.status_code == 200:
                            print(f"✅ [STREAM] Connected to {attempt_model}!", flush=True)
                            async for line in response.aiter_lines():
                                if line.startswith("data: "):
                                    data_str = line.replace("data: ", "").strip()
                                    if data_str == "[DONE]": break
                                    try:
                                        data_json = json.loads(data_str)
                                        delta = data_json.get("choices", [{}])[0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content: yield content.encode("utf-8")
                                    except Exception: continue
                            return

                        error_body = (await response.aread()).decode('utf-8')
                        if response.status_code == 429:
                            print(f"⚠️ [STREAM WARNING] 429 Rate Limit on {attempt_model}. Retrying next...", flush=True)
                            await asyncio.sleep(1) # Short pause before next model
                            continue
                        elif response.status_code == 400:
                            if "response_format" in error_body:
                                print(f"⚠️ [STREAM WARNING] Model {attempt_model} doesn't support JSON mode. Retrying next...", flush=True)
                                continue

                            print(f"❌ [STREAM ERROR] Fatal 400 on {attempt_model}: {error_body}", flush=True)
                            continue
                        else:
                            continue

                except Exception as e:
                    print(f"🔥 [STREAM EXCEPTION] {attempt_model}: {str(e)}", flush=True)
                    continue

            yield b"Error: Daily Limit Reached. All available models are currently overloaded."

ai_service = AIService()