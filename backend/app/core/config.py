import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Mind Cracker Enterprise"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    
    def get_clean_db_url(self):
        if not self.DATABASE_URL: return "sqlite+aiosqlite:///./test.db" # Fallback
        return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").split("?")[0]

settings = Settings()