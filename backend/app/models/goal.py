from sqlalchemy import Column, Integer, String, JSON, DateTime, Text
from datetime import datetime
from app.core.database import Base

class Goal(Base):
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=True)
    original_goal = Column(Text)
    model_used = Column(String)
    breakdown = Column(JSON)
    thinking_process = Column(Text, nullable=True)
    # Stores the full branched conversation tree
    chat_history = Column(JSON, nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)