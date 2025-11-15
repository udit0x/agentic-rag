"""FastAPI application entry point."""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Configure logging FIRST before any other imports
from server.logging_config import configure_logging
configure_logging()

# Now we can use logging
import logging
logger = logging.getLogger(__name__)

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
    logger.info("Loaded environment from %s", env_path)
else:
    logger.warning("No .env file found at %s", env_path)

# Add parent directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from server.api.documents import router as documents_router
from server.api.chat import router as chat_router
from server.api.config import router as config_router
from server.api.chat_history import router as chat_history_router
from server.api.users import router as users_router
from server.api.feedback import router as feedback_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting RAG Orchestrator API...")
    
    # Initialize database connection at startup
    try:
        from server.database_interface import db_storage
        await db_storage.initialize()
        logger.info("Database initialization completed")
    except Exception as e:
        logger.error("Database initialization failed: %s", str(e))
        # Don't crash the app, but log the error
    
    # Initialize configuration manager
    try:
        from server.config_manager import config_manager
        await config_manager.initialize()
        current_config = config_manager.get_current_config()
        logger.info("Loaded configuration from %s (version %s)", current_config.source, current_config.version)
        if not config_manager.is_configured():
            logger.warning("Configuration incomplete - setup required")
    except Exception as e:
        logger.error("Configuration initialization failed: %s", str(e))
    
    yield
    
    # Shutdown
    logger.info("Shutting down RAG Orchestrator API...")
    try:
        from server.config_manager import config_manager
        await config_manager.close()
    except Exception:
        pass

app = FastAPI(
    title="RAG Orchestrator API",
    description="Multi-Agent Document Intelligence System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - environment-based
ENV = os.getenv("ENV", "development")

if ENV == "development":
    # Development CORS - allow localhost origins
    cors_origins = [
        "http://localhost:5000",  # Express dev server
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative React dev server
        "http://localhost:8000",  # FastAPI dev server
        "http://127.0.0.1:5000",  # Alternative Express
        "http://127.0.0.1:5173",  # Alternative Vite
        "http://127.0.0.1:8000",  # Alternative FastAPI
    ]
else:
    # Production CORS - use environment variable or specific origins
    cors_origins_env = os.getenv("CORS_ORIGINS", "")
    if cors_origins_env:
        cors_origins = [origin.strip() for origin in cors_origins_env.split(",")]
    else:
        # Fallback to specific Azure URLs (update these with your actual URLs)
        cors_origins = [
            os.getenv("FRONTEND_URL", "https://yourfrontend.azurestaticapps.net"),
            os.getenv("EXPRESS_BACKEND_URL", "https://yourapi.azurewebsites.net"),
        ]

logger.info("CORS configured - env=%s, origins=%s", ENV, cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(config_router)
app.include_router(chat_history_router)
app.include_router(users_router)
app.include_router(feedback_router)

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "rag-orchestrator"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
