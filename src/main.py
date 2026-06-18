"""
main.py — Huawei SpiriCom Backend
"""

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.nlp.auth_api import router as auth_router, admin_router
from src.nlp.nlp_api import router as nlp_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(
    title="Huawei SpiriCom API",
    version="2.0.0",
    description="Unified Backend for NOC Dashboard & Complaint Analysis"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(nlp_router)

logger.info("Auth routes registered at /api/auth")
logger.info("Admin routes registered at /api/admin")
logger.info("NLP routes registered at /api/complaints")

@app.get("/")
async def root():
    return {
        "project": "Huawei SpiriCom",
        "status": "online",
        "modules": {
            "auth": "/api/auth",
            "admin": "/api/admin",
            "nlp": "/api/complaints",
        }
    }