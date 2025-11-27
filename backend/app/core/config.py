from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mind Cracker"
    API_V1_STR: str = "/api/v1"

    DATABASE_URL: str = Field(..., env="DATABASE_URL")

    OPENROUTER_API_KEY: str = Field(..., env="OPENROUTER_API_KEY")
    GEMINI_API_KEY: str = Field("", env="GEMINI_API_KEY")
    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    @property
    def async_database_url(self) -> str:
        """
        Converts standard Postgres URLs to AsyncPG-compatible URLs.
        Removes 'sslmode' param which causes crashes with asyncpg.
        """
        if "sqlite" in self.DATABASE_URL:
            return self.DATABASE_URL

        # 1. Convert protocol to asyncpg
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

        # 2. Remove sslmode=require (asyncpg doesn't support this in DSN)
        url = url.replace("?sslmode=require", "").replace("&sslmode=require", "")

        return url

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()