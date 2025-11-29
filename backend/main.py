from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
from app.core.config import settings
from app.api.endpoints import goals
import logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger("security")

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# app.add_middleware(
#     TrustedHostMiddleware, 
#     allowed_hosts=["*.onrender.com", "localhost", "127.0.0.1"]
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://172.20.10.3:3000",
        "http://localhost:3001",
        "http://172.20.10.3:3001",
        "http://172.20.10.3:3002",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# --- SECURITY: GRACEFUL VALIDATION ERRORS ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        field = error.get("loc", [])[-1]
        msg = error.get("msg", "Invalid value")
        errors.append(f"{field}: {msg}")
        
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation Error", "errors": errors}
    )

# --- SECURITY: GLOBAL EXCEPTION HANDLER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"🔥 CRITICAL ERROR: {str(exc)} | Path: {request.url}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

@app.get("/")
@limiter.limit("20/minute") 
async def health_check(request: Request):
    return {"status": "ok", "message": "Mind Cracker Backend is Secure"}

app.include_router(goals.router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)