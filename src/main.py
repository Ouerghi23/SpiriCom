"""
main.py
============
Unified entry point for Huawei SpiriCom Backend.
Connects Auth and NLP routers.
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import Routers
from src.nlp.auth_api import router as auth_router
from src.nlp.nlp_api import router as nlp_router

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

# Initialize App
app = FastAPI(
    title="Huawei SpiriCom API",
    version="2.0.0",
    description="Unified Backend for NOC Dashboard & Complaint Analysis"
)

# --- CORS Configuration ---
# Crucial: Allow requests from your React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change to ["http://localhost:3000"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include Routers ---
# 1. Auth Routes (Login, User Mgmt)
app.include_router(auth_router)
logger.info("Auth routes registered at /api/auth")

# 2. NLP/Complaints Routes (Analysis, Form, Stats)
# Note: The NLP router defines paths like "/api/complaints", so we mount it at root "/"
app.include_router(nlp_router)
logger.info("NLP routes registered at /api/complaints")

# --- Root Endpoint ---
@app.get("/")
async def root():
    return {
        "project": "Huawei SpiriCom",
        "status": "online",
        "modules": {
            "auth": "/api/auth/docs",
            "nlp": "/api/complaints/docs",
            "form": "/form"
        }
    }