import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db
from routes.auth import router as auth_router
from routes.documents import router as docs_router
from routes.youtube import router as youtube_router
from routes.chat import router as chat_router
from routes.hf import router as hf_router
from routes.analyze import router as analyze_router
from routes.health import router as health_router
from routes.agent import router as agent_router
from routes.codereview import router as codereview_router
from routes.resume import router as resume_router
from routes.vision import router as vision_router
from routes.transcribe import router as transcribe_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting DataMind AI API...")
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database init failed: {e}")
    yield
    logger.info("Shutting down DataMind AI API...")


app = FastAPI(
    title="DataMind AI API",
    description="Advanced Agentic AI Platform — 5 Modules: Data Analyst, Document Chat, YouTube Intelligence, AI Chatbot, HuggingFace Playground",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(docs_router)
app.include_router(youtube_router)
app.include_router(chat_router)
app.include_router(hf_router)
app.include_router(analyze_router)
app.include_router(agent_router)
app.include_router(codereview_router)
app.include_router(resume_router)
app.include_router(vision_router)
app.include_router(transcribe_router)


@app.get("/api")
async def root():
    return {
        "name": "DataMind AI API",
        "version": "1.0.0",
        "modules": ["Data Analyst", "Document Chat", "YouTube Intelligence", "AI Chatbot", "HuggingFace Playground"],
        "docs": "/api/docs",
    }
