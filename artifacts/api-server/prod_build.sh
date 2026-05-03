#!/bin/bash
set -e

echo "=== DataMind AI Backend — Production Build ==="

PYTHON=/home/runner/workspace/.pythonlibs/bin/python3
PIP_CMD="$PYTHON -m pip"
WORKSPACE=/home/runner/workspace

cd "$(dirname "$0")/python"

echo "[1/4] Installing production Python dependencies..."
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
  "onnxruntime>=1.17.0" \
  "pdfplumber==0.11.0" \
  "pymupdf==1.24.5" \
  "python-docx==1.1.2" \
  "youtube-transcript-api==0.6.2" \
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
  2>&1 | grep -v "^Requirement already" | tail -20

echo "[2/4] Removing heavy packages not needed in production..."
$PIP_CMD uninstall -y \
  torch \
  torchvision \
  torchaudio \
  triton \
  transformers \
  sentence-transformers \
  sentencepiece \
  sacremoses \
  pytube \
  2>/dev/null || true

echo "[3/4] Cleaning build caches to reduce image size..."
rm -rf "$WORKSPACE/.cache/huggingface"
rm -rf "$WORKSPACE/.cache/pip"
rm -rf "$WORKSPACE/.cache/uv"
rm -rf "$HOME/.cache/huggingface"
rm -rf "$HOME/.cache/pip"
# Clean pip package cache inside pythonlibs
$PIP_CMD cache purge 2>/dev/null || true
# Remove compiled bytecode caches to save space
find "$WORKSPACE/artifacts/api-server/python" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

echo "[4/4] Pre-warming ONNX embedding model..."
$PYTHON -c "
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
ef = DefaultEmbeddingFunction()
ef(['warmup text'])
print('ONNX embedding model ready')
" 2>&1 || echo "ONNX warmup skipped (will download on first use)"

echo ""
echo "=== Final .pythonlibs size ==="
du -sh "$WORKSPACE/.pythonlibs" 2>/dev/null || true
echo "=== Final .cache size ==="
du -sh "$WORKSPACE/.cache" 2>/dev/null || true
echo "=== Production build complete ==="
