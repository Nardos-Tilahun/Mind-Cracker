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
        Safely removes 'sslmode' and 'channel_binding' to prevent asyncpg errors.
        """
        if "sqlite" in self.DATABASE_URL:
            return self.DATABASE_URL

        # 1. Replace scheme
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

        # 2. Robustly handle query parameters
        try:
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed.query)
            
            # Remove unsupported asyncpg parameters
            params_to_remove = ['sslmode', 'channel_binding']
            for param in params_to_remove:
                if param in query_params:
                    del query_params[param]
            
            # Rebuild query string
            new_query = urllib.parse.urlencode(query_params, doseq=True)
            
            # Reconstruct URL
            url = urllib.parse.urlunparse(parsed._replace(query=new_query))
        except Exception:
            # Fallback: basic string replacement if parsing fails
            url = url.replace("?sslmode=require", "").replace("&sslmode=require", "")
            url = url.replace("?channel_binding=require", "").replace("&channel_binding=require", "")

        return url

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()