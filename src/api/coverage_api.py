# src/api/coverage_api.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — 5G Coverage API
# Serves data/outputs/coverage_5g.json (produced by NB04b) to
# Coverage5GSection.jsx via GET /api/coverage/5g (matches client.js).
#
# Register BEFORE (or remove) any old /api/coverage/5g route in
# analytics_api.py — FastAPI serves the first matching route.
#   from .coverage_api import router as coverage_router
#   app.include_router(coverage_router)
# ─────────────────────────────────────────────────────────────────────
from pathlib import Path

from fastapi import APIRouter, HTTPException

from .artifact_cache import get_json

router = APIRouter(prefix="/api/coverage", tags=["coverage"])

COVERAGE_JSON = Path("data/outputs/coverage_5g.json")


@router.get("/5g")
def coverage_5g():
    payload = get_json(COVERAGE_JSON)
    if payload is None:
        raise HTTPException(
            503, "coverage_5g.json missing - run 04b_5G_Coverage.ipynb")
    return payload