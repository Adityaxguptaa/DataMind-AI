# DataMind AI

## Overview

Full-stack agentic AI platform with 5 modules: Data Analyst Agent, Document Chat (RAG), YouTube Intelligence, AI Chatbot with Tools, and HuggingFace Model Playground.

## Architecture

pnpm monorepo with two active artifacts:
- **Frontend**: React + Vite (TypeScript) — artifact `datamind-frontend`, served at `/`
- **Backend**: Python FastAPI — artifact `api-server`, served at `/api`

## Backend Stack

- **Framework**: Python FastAPI with uvicorn (asyncio)
- **Database**: NeonDB PostgreSQL via asyncpg + SQLAlchemy async
- **Auth**: JWT (access + refresh tokens) with bcrypt password hashing
- **AI**: Groq API (`groq` SDK) — auto-rotates models on rate limit / overload
- **Groq model priority**: `llama-3.3-70b-versatile` → `llama-3.1-70b-versatile` → `mixtral-8x7b-32768` → `llama-3.1-8b-instant` → `gemma2-9b-it`
- **Vector DB**: ChromaDB with sentence-transformers for RAG
- **Python version**: 3.11 (`.pythonlibs`)

## Frontend Stack

- **Framework**: React 19 + Vite + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui components — premium deep-space dark glassmorphism theme
- **Routing**: wouter
- **State**: React hooks + TanStack Query
- **Charts**: plotly.js-dist-min (dynamic import, transparent/styled)
- **Icons**: lucide-react

## Backend Entry Point

```
artifacts/api-server/python/main.py
```
Started via `artifacts/api-server/start.sh` which runs pip install then uvicorn.

## Key Environment Variables

- `NEON_DATABASE_URL` — asyncpg connection string (sslmode handled in code)
- `NEON_SYNC_DATABASE_URL` — psycopg2 sync connection string
- `JWT_SECRET_KEY` — JWT signing key
- `GROQ_API_KEY` — Groq API key (powers all LLM inference)
- `HUGGINGFACE_TOKEN` — HuggingFace API token
- `SESSION_SECRET` — session secret

## API Routes

All routes prefixed with `/api`:
- `/api/auth/*` — JWT register, login, refresh, logout, me, profile
- `/api/documents/*` — Document upload, RAG indexing, chat (NO deleted_at — hard delete)
- `/api/youtube/*` — YouTube processing, chat (multilingual transcript fallback)
- `/api/chat/*` — AI chatbot sessions with tool use
- `/api/hf/*` — HuggingFace inference (local transformers pipeline)
- `/api/analyze`, `/api/data-sources/*` — Data Analyst Agent
- `/api/data-sources/upload` — alias on analyze.py router too
- `/api/healthz` — Health check

## Frontend Pages (Premium UI)

All pages use deep-space dark theme (#050810), glassmorphism cards, ambient orbs, grid background.

- `/login` — Neural network canvas animation, glassmorphism card, gradient text
- `/register` — Same premium login aesthetic, violet theme
- `/dashboard` — Animated stat cards with glow, quick action pills, module cards
- `/analyst` — Data Analyst Agent (CSV/Excel/PDF → Plotly charts, AI insights)
- `/documents` — Document Chat RAG (upload → index → chat with sources)
- `/youtube` — YouTube Intelligence (multilingual → transcript → RAG chat with timestamps)
- `/chatbot` — AI Chatbot with tool use (web_search, wikipedia, calculator, url_summarizer)
- `/playground` — HuggingFace Playground (sentiment/NER/summarization/zero-shot/translation)

## Key Files

- `artifacts/api-server/python/main.py` — FastAPI app entry
- `artifacts/api-server/python/database.py` — async SQLAlchemy setup with NeonDB SSL
- `artifacts/api-server/python/services/gemini_client.py` — Groq client (same interface) with model rotation on rate-limit
- `artifacts/api-server/python/services/youtube_service.py` — multilingual transcript with full fallback chain
- `artifacts/api-server/python/routes/documents.py` — Document model has NO deleted_at (hard delete)
- `artifacts/api-server/python/config.py` — pydantic-settings config
- `artifacts/datamind-frontend/src/index.css` — glassmorphism utilities, glow classes, animations
- `artifacts/datamind-frontend/src/components/layout/DashboardLayout.tsx` — premium sidebar
- `artifacts/datamind-frontend/src/lib/api.ts` — authenticated API client
- `artifacts/datamind-frontend/src/hooks/useAuth.ts` — auth state hook

## HuggingFace Models (Free Tier)

- `sentiment` → `distilbert-base-uncased-finetuned-sst-2-english`
- `zero-shot` → `facebook/bart-large-mnli`
- `ner` → `dbmdz/bert-large-cased-finetuned-conll03-english`
- `summarization` → `facebook/bart-large-cnn`
- `translation-fr/de/hi` → `Helsinki-NLP/opus-mt-*` models

## Important Notes

- Password hashing uses `bcrypt` directly (NOT passlib — incompatible with bcrypt>=4)
- `cors_origins` in config.py is a `str`, not `list` (pydantic-settings JSON parsing issue)
- Database URL: sslmode stripped from URL, passed via `connect_args={"ssl": "require"}` to asyncpg
- plotly.js used via dynamic `import("plotly.js-dist-min")` in a useRef-based component
- Document model has NO `deleted_at` column — queries must NOT filter on it (hard delete only)
- YouTube transcript: tries English → auto-generated → translate → any language → last resort
- YouTube route catches ValueError and returns HTTP 400 (not 500) for missing transcripts
- Gemini auto-rotates models on ResourceExhausted (429) — tries up to 5 candidates
- ChromaDB telemetry posthog errors are harmless — do NOT affect functionality
