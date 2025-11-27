from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.core.config import settings
from app.api.endpoints import goals
import logging

# --- SECURITY: RATE LIMITING ---
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Setup Logging
logging.basicConfig(level=logging.ERROR) # Only log errors to keep logs clean
logger = logging.getLogger("security")

# Initialize Limiter (Anti-DDoS)
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    docs_url=None, # SECURITY: Hide Swagger UI in production
    redoc_url=None
)

# Connect Limiter to App
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- SECURITY: TRUSTED HOSTS ---
# Prevents Host Header attacks
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*.onrender.com", "localhost", "127.0.0.1"]
)

# --- SECURITY: CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_origin_regex=r"https://.*\.onrender\.com", 
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], # Explicit methods only
    allow_headers=["Authorization", "Content-Type"], # Explicit headers only
)

# --- SECURITY: GLOBAL EXCEPTION HANDLER ---
# Catch ALL runtime errors. Log them internally, show generic message to user.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the REAL error for the developer
    logger.error(f"🔥 CRITICAL ERROR: {str(exc)} | Path: {request.url}")
    
    # Send GENERIC error to user (Security Best Practice)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

# --- HEALTH CHECK ---
@app.get("/")
@limiter.limit("20/minute") # Light limit for health check
async def health_check(request: Request):
    return {"status": "ok", "message": "Mind Cracker Backend is Secure"}

# --- ROUTER ---
app.include_router(goals.router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)