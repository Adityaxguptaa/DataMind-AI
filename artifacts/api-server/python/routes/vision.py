import base64
import logging
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from auth.dependencies import get_current_user
from models.db_models import User
from services.gemini_client import get_client

router = APIRouter(prefix="/api/vision", tags=["vision"])
logger = logging.getLogger(__name__)

VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


@router.post("/extract")
async def extract_from_image(
    file: UploadFile = File(...),
    question: str = Form(default="Extract ALL text, code, and information from this image exactly as written. Preserve formatting, indentation, and structure."),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 20MB.")
    b64 = base64.b64encode(content).decode()
    mime = file.content_type or "image/jpeg"
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")
    client = get_client()
    try:
        response = await client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": question},
                ],
            }],
            max_tokens=4096,
            temperature=0.1,
        )
        text = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Vision extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)[:200]}")
    return {"text": text, "model": VISION_MODEL}


@router.post("/ask")
async def ask_about_image(
    file: UploadFile = File(...),
    question: str = Form(...),
    context: str = Form(default=""),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    mime = file.content_type or "image/jpeg"
    client = get_client()
    system_ctx = f"\nAdditional context: {context}" if context else ""
    try:
        response = await client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": f"{question}{system_ctx}"},
                ],
            }],
            max_tokens=2048,
            temperature=0.3,
        )
        answer = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Vision Q&A failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image Q&A failed: {str(e)[:200]}")
    return {"answer": answer, "model": VISION_MODEL}
