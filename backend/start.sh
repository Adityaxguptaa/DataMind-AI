#!/bin/bash
set -e

echo "=== DataMind AI Backend Startup ==="

PYTHON=/home/runner/workspace/.pythonlibs/bin/python3
PIP_CMD="$PYTHON -m pip"

cd "$(dirname "$0")/python"

echo "Installing Python dependencies..."
$PIP_CMD install -q --no-cache-dir \
  "fastapi==0.111.0" \
  "uvicorn[standard]==0.29.0" \
  "python-multipart==0.0.9" \
  "pydantic==2.7.1" \
  "pydantic-settings==2.2.1" \
  "sqlalchemy[asyncio]==2.0.30" \
  "asyncpg==0.29.0" \
  "psycopg2-binary==2.9.9" \
  "python-jose[cryptography]==3.3.0" \
  "redis==5.0.4" \
  "groq==0.11.0" \
  "chromadb==0.5.3" \
  "sentence-transformers==2.7.0" \
  "pdfplumber==0.11.0" \
  "pymupdf==1.24.5" \
  "python-docx==1.1.2" \
  "youtube-transcript-api==0.6.2" \
  "pytube" \
  "duckduckgo-search==6.1.7" \
  "wikipedia==1.4.0" \
  "httpx==0.27.0" \
  "aiofiles==23.2.1" \
  "plotly==5.22.0" \
  "pandas==2.2.2" \
  "numpy==1.26.4" \
  "openpyxl==3.1.4" \
  "xlrd==2.0.1" \
  "pillow==10.3.0" \
  "scipy==1.13.0" \
  "nltk==3.8.1" \
  "sentencepiece==0.2.0" \
  "sacremoses==0.1.1" \
  2>&1 | grep -v "^Requirement already" | tail -10

echo "Starting uvicorn server on port $PORT..."
exec $PYTHON -m uvicorn main:app --host 0.0.0.0 --port "$PORT" --log-level info
