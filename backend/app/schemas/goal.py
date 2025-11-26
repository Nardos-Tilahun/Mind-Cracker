from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class ChatMessage(BaseModel):
    role: str
    content: str

class StreamRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    user_id: Optional[str] = None

class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    context_length: int

class SaveGoalRequest(BaseModel):
    title: str
    chat_history: List[Any] # Receives ChatTurn[]
    preview: Optional[Any] = None 

class HistoryItem(BaseModel):
    id: int
    goal: str
    model: str
    date: datetime
    preview: List[dict]
    thinking: Optional[str] = None
    chat_history: Optional[List[Any]] = None

class SloganItem(BaseModel):
    headline: str
    subtext: str
    example: str

class SloganResponse(BaseModel):
    slogans: List[SloganItem]