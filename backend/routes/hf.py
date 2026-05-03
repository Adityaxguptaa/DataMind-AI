import uuid
import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.db_models import HFInferenceLog, User
from models.schemas import HFInferenceRequest
from auth.dependencies import get_current_user
from services.hf_service import run_inference, get_available_models
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hf", tags=["huggingface"])


@router.post("/inference")
async def run_hf_inference(req: HFInferenceRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    input_text = req.get_input_text()
    labels = req.get_labels()
    extra = req.extra_params or {}
    if labels:
        extra = {**extra, "labels": labels}
    try:
        result = await run_inference(req.task, input_text, extra, labels=labels if labels else None)
    except ValueError as e:
        logger.warning(f"HF inference validation error task={req.task}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"HF inference failed task={req.task}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")
    log = HFInferenceLog(
        id=str(uuid.uuid4()), user_id=current_user.id,
        model_name=result["model"], task=req.task,
        input_text=input_text[:1000] if input_text else "", output_json=result["result"],
        duration_ms=result["duration_ms"],
    )
    db.add(log)
    await db.commit()
    return {
        "result": result["result"],
        "duration_ms": result["duration_ms"],
        "model_name": result["model"],
        "task": req.task,
    }


@router.get("/models")
async def get_models(current_user: User = Depends(get_current_user)):
    return get_available_models()


@router.get("/history")
async def get_history(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(HFInferenceLog).where(HFInferenceLog.user_id == current_user.id).order_by(HFInferenceLog.created_at.desc()).limit(20))
    logs = result.scalars().all()
    return [{"id": l.id, "model_name": l.model_name, "task": l.task, "input_text": l.input_text[:100], "output_json": l.output_json, "duration_ms": l.duration_ms, "created_at": l.created_at} for l in logs]
