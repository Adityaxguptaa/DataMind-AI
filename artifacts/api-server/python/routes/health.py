from fastapi import APIRouter
from datetime import datetime

router = APIRouter(tags=["health"])


@router.get("/")
async def root_health():
    return {"status": "ok"}


@router.get("/api/healthz")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "service": "DataMind AI API"}


@router.get("/api/health")
async def health():
    return {"status": "healthy"}
