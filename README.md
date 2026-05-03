# DataMind AI

Production-grade agentic AI platform with 6 intelligent modules.

## Modules
- **Data Analyst Agent** - Upload CSV/Excel, ask questions in plain English, get charts and insights
- **Document Chat (RAG)** - Upload PDFs, chat with them, auto-generate MCQs and summaries
- **AI Chatbot with Tools** - Context-aware chatbot with web search, math, weather and code tools
- **HuggingFace NLP Playground** - Sentiment, NER, translation, summarization (Groq-powered)
- **Code Review & Security Scanner** - AI-powered code review with vulnerability detection
- **Resume Scanner & Builder** - ATS scoring, job-description matching, smart resume builder

## Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Python FastAPI + asyncpg |
| Database | NeonDB (PostgreSQL) |
| Vector DB | ChromaDB (ONNX embeddings) |
| AI | Groq API (Llama 3, Mixtral) |
| Auth | JWT |

## Project Structure
```
frontend/   # React + Vite frontend
backend/    # FastAPI backend + Python services
```

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables
| Variable | Description |
|----------|-------------|
| `NEON_DATABASE_URL` | NeonDB PostgreSQL connection string |
| `GROQ_API_KEY` | Groq API key |
| `JWT_SECRET_KEY` | JWT signing secret |
| `REDIS_URL` | (optional) Redis for caching |
| `GEMINI_API_KEY` | (optional) Gemini API key |

## Live Demo
https://neon-redis-ai--ag80860307.replit.app
