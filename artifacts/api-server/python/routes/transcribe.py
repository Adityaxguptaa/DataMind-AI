import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from auth.dependencies import get_current_user
from models.db_models import User
from config import settings
from groq import AsyncGroq

router = APIRouter(prefix="/api", tags=["transcribe"])
logger = logging.getLogger(__name__)


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="Audio too short or empty")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large. Max 25MB.")

    fname = file.filename or "audio.webm"
    suffix = os.path.splitext(fname)[1] or ".webm"
    ct = file.content_type or "audio/webm"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        with open(tmp_path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(fname, f, ct),
                response_format="json",
            )
        return {"text": transcript.text, "model": "whisper-large-v3"}
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)[:200]}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
