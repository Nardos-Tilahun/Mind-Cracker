import httpx
import json
import asyncio
import re
import random
from typing import AsyncGenerator, List
from app.core.config import settings
from app.schemas.goal import ChatMessage, SloganItem

class AIService:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://goalbreaker.app",
            "X-Title": "Goal Breaker",
            "Content-Type": "application/json",
            "User-Agent": "GoalBreaker/Enterprise"
        }
        self.system_prompt = """
        You are 'The Smart Goal Breaker', a strategic agent.

        PROTOCOL:
        1. **CLASSIFY INPUT**:
           - Is it a **GREETING**? -> **FAST PATH** (No thinking).
           - Is it a **GOAL**? -> **DEEP PATH** (Analyze then JSON).

        2. **FAST PATH**:
           - DO NOT use <think> tags.
           - Return: { "message": "I am the Goal Breaker..." }

        3. **DEEP PATH**:
           - First, use <think> tags to analyze.
           - Then, return JSON with exactly **5 Actionable Steps**.

        4. **JSON STRUCTURE**:
           {
             "title": "Short Title",
             "steps": [
               { "step": "Step Name", "complexity": 5, "description": "Details." },
               ...
             ]
           }
        """

    async def generate_title(self, history_summary: str) -> str:
        payload = {
            "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
            "messages": [
                {"role": "system", "content": "You are a title generator. Create a concise, action-oriented title (max 6 words) for this conversation. Return ONLY the title text, no quotes."},
                {"role": "user", "content": f"Conversation context:\n{history_summary}"}
            ],
            "stream": False,
            "temperature": 0.5,
            "max_tokens": 20
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content']
                    return content.strip().strip('"').strip("'")
            except Exception as e:
                print(f"Title generation failed: {e}")
        return "New Strategy"

    async def generate_slogans(self) -> List[SloganItem]:
        """Generates a massive batch of 20 unique, engaging slogans + examples."""
        
        # Injecting a random seed ensures the LLM sees a 'new' prompt every time
        random_seed = random.randint(1, 100000)

        prompt = f"""
        Generate exactly 20 distinct slogans for an AI goal-breakdown tool.
        Random Seed: {random_seed}

        CRITICAL: You must vary the tone significantly. 
        - DO NOT repeat examples like "Run a marathon" or "Learn Python" every time. 
        - Use niche examples: e.g., "Build a Chicken Coop", "Plan a Mars Mission", "Learn to Unicycle", "Organize a Block Party".

        Format: JSON Array of objects with keys:
        - "headline": Punchy hook (max 5 words).
        - "subtext": Value prop (max 10 words).
        - "example": A specific, unique goal (Mix tech, health, finance, and lifestyle).

        Output strictly raw JSON. No markdown.
        """

        payload = {
            "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
            "messages": [
                {"role": "system", "content": "You are a creative director. Output strictly raw JSON array of 20 items."},
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "temperature": 1.0, # Max creativity to prevent duplicates
            "max_tokens": 2500
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()['choices'][0]['message']['content']
                    
                    match = re.search(r'\[.*\]', content, re.DOTALL)
                    if match:
                        json_str = match.group(0)
                        data = json.loads(json_str)
                        slogans = []
                        source = data if isinstance(data, list) else data.get("slogans", [])

                        for item in source:
                            slogans.append(SloganItem(**item))

                        return slogans[:20]
            except Exception as e:
                print(f"Slogan generation failed: {e}")

        # Expanded Fallback List (12 Items) to ensure variety even if API fails
        return [
            SloganItem(headline="Action Over Anxiety", subtext="Stop overthinking. Get a plan.", example="Launch a Podcast"),
            SloganItem(headline="Complexity Killer", subtext="We eat big goals for breakfast.", example="Learn Japanese"),
            SloganItem(headline="The Blueprint Engine", subtext="Your ambition, architected.", example="Build a Tiny House"),
            SloganItem(headline="Zero to One", subtext="The fastest path from idea to execution.", example="Write a Novel"),
            SloganItem(headline="Crush the Chaos", subtext="Turn messy thoughts into clear steps.", example="Plan a Euro Trip"),
            SloganItem(headline="Dream Big, Step Small", subtext="Momentum starts with one step.", example="Train for a Triathlon"),
            SloganItem(headline="The Strategy Machine", subtext="AI that thinks like a CEO.", example="Scale My Business"),
            SloganItem(headline="Unstoppable You", subtext="Break limits, not promises.", example="Learn Guitar"),
            SloganItem(headline="Financial Freedom", subtext="Map your path to wealth.", example="Save $10k in 6 months"),
            SloganItem(headline="Code Your Future", subtext="From newbie to developer.", example="Build a React App"),
            SloganItem(headline="Master the Kitchen", subtext="Cook like a pro in weeks.", example="Master French Cooking"),
            SloganItem(headline="Career Pivot", subtext="Switch lanes with confidence.", example="Become a Data Scientist")
        ]

    async def stream_chat(self, messages: List[ChatMessage], model: str) -> AsyncGenerator[bytes, None]:
        valid_messages = [m.dict() for m in messages if m.content and m.content.strip()]
        api_messages = [{"role": "system", "content": self.system_prompt}] + valid_messages

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": True,
            "temperature": 0.6,
            "max_tokens": 4096
        }

        client_opts = {"timeout": httpx.Timeout(120.0, connect=10.0)}

        async with httpx.AsyncClient(**client_opts) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=self.headers, json=payload) as response:
                    if response.status_code != 200:
                        yield b"Error: Service Unavailable."
                        return

                    buffer = ""
                    async for chunk in response.aiter_bytes():
                        decoded = chunk.decode("utf-8", errors="ignore")
                        buffer += decoded

                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if line.startswith("data: ") and line != "data: [DONE]":
                                try:
                                    json_str = line[6:]
                                    data = json.loads(json_str)
                                    content = data['choices'][0]['delta'].get('content', '')
                                    if content:
                                        yield content.encode('utf-8')
                                except: pass
                        await asyncio.sleep(0)
            except:
                yield b"Error: Connection failed."

ai_service = AIService()