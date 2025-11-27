from pydantic_settings import BaseSettings
from pydantic import Field
import urllib.parse

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mind Cracker"
    API_V1_STR: str = "/api/v1"

    # Render will provide the external URL here
    DATABASE_URL: str = Field(..., env="DATABASE_URL")

    OPENROUTER_API_KEY: str = Field(..., env="OPENROUTER_API_KEY")
    GEMINI_API_KEY: str = Field("", env="GEMINI_API_KEY")
    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    @property
    def async_database_url(self) -> str:
        """
        Converts standard Postgres URLs to AsyncPG-compatible URLs.
        Safely removes 'sslmode' to prevent asyncpg errors while keeping other params.
        """
        if "sqlite" in self.DATABASE_URL:
            return self.DATABASE_URL

        # 1. Replace scheme
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

        # 2. Robustly handle query parameters
        try:
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed.query)
            
            # Remove sslmode if present
            if 'sslmode' in query_params:
                del query_params['sslmode']
            
            # Rebuild query string
            new_query = urllib.parse.urlencode(query_params, doseq=True)
            
            # Reconstruct URL
            url = urllib.parse.urlunparse(parsed._replace(query=new_query))
        except Exception:
            # Fallback if parsing fails
            pass

        return url

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()