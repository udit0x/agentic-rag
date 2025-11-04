"""FastAPI application entry point."""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"[MAIN] Loaded environment from {env_path}")
else:
    print(f"[MAIN] No .env file found at {env_path}")

# Add parent directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.api.documents import router as documents_router
from server.api.chat import router as chat_router
from server.api.config import router as config_router
from server.api.chat_history import router as chat_history_router
from server.api.users import router as users_router

app = FastAPI(
    title="RAG Orchestrator API",
    description="Multi-Agent Document Intelligence System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",  # Express dev server
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative React dev server
        "http://localhost:8000",  # FastAPI dev server
        "http://127.0.0.1:5000",  # Alternative Express
        "http://127.0.0.1:5173",  # Alternative Vite
        "http://127.0.0.1:8000",  # Alternative FastAPI
    ],
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

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "rag-orchestrator"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
