#!/bin/bash
set -e

PYTHON=/home/runner/workspace/.pythonlibs/bin/python3

cd "$(dirname "$0")/python"

echo "Starting DataMind AI API on port ${PORT:-8080}..."
exec $PYTHON -m uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --log-level info \
  --workers 1
