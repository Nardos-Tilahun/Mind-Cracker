from pydantic_settings import BaseSettings
from pydantic import Field
import urllib.parse
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mind Cracker"
    API_V1_STR: str = "/api/v1"

    DATABASE_URL: str = Field(..., env="DATABASE_URL")

    # CHANGED: Switched to Groq
    GROQ_API_KEY: str = Field(..., env="GROQ_API_KEY")
    
    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    @property
    def async_database_url(self) -> str:
        if "sqlite" in self.DATABASE_URL:
            return self.DATABASE_URL

        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        try:
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed.query)
            params_to_remove = ['sslmode', 'channel_binding']
            for param in params_to_remove:
                if param in query_params:
                    del query_params[param]
            new_query = urllib.parse.urlencode(query_params, doseq=True)
            url = urllib.parse.urlunparse(parsed._replace(query=new_query))
        except Exception:
            url = url.replace("?sslmode=require", "").replace("&sslmode=require", "")
            url = url.replace("?channel_binding=require", "").replace("&channel_binding=require", "")

        return url

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()