from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mind Cracker Enterprise"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    OPENROUTER_API_KEY: str = Field(..., env="OPENROUTER_API_KEY")
    GEMINI_API_KEY: str = Field("", env="GEMINI_API_KEY")
    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    @property
    def async_database_url(self) -> str:
        if "sqlite" in self.DATABASE_URL:
            return self.DATABASE_URL
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        return url.split("?")[0]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()