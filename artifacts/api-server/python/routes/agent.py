import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from database import get_db
from models.db_models import Document, Analysis, User, ChatSession
from auth.dependencies import get_current_user
from pydantic import BaseModel
from services.gemini_client import generate_text
import json, re

router = APIRouter(prefix="/api/agent", tags=["agent"])
logger = logging.getLogger(__name__)


class AgentCommandRequest(BaseModel):
    command: str


@router.post("/command")
async def run_agent_command(
    req: AgentCommandRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cmd = req.command.strip()

    docs_result = await db.execute(
        select(Document).where(Document.user_id == current_user.id).order_by(Document.uploaded_at.desc())
    )
    docs = docs_result.scalars().all()

    analyses_result = await db.execute(
        select(func.count()).where(Analysis.user_id == current_user.id)
    )
    analyses_count = analyses_result.scalar() or 0

    sessions_result = await db.execute(
        select(func.count()).where(ChatSession.user_id == current_user.id)
    )
    sessions_count = sessions_result.scalar() or 0

    doc_list_text = "\n".join([f"- ID: {d.id[:8]}... Name: {d.filename} Status: {d.status}" for d in docs]) or "No documents found."

    intent_prompt = f"""You are a platform assistant AI. The user has sent a command. Figure out what they want and respond with a JSON object.

Platform context:
- Total documents: {len(docs)}
- Document list:
{doc_list_text}
- Total analyses run: {analyses_count}
- Total chat sessions: {sessions_count}

User command: "{cmd}"

Respond with ONLY valid JSON (no markdown):
{{
  "intent": "<one of: list_documents | delete_document | count_documents | count_analyses | count_sessions | show_stats | general_answer>",
  "target_doc_name": "<filename to delete if intent is delete_document, or null>",
  "response_message": "<friendly natural language response to the user, answer their question directly using the platform data above>",
  "data": <any relevant data as a JSON object, or null>
}}"""

    try:
        raw = await generate_text(intent_prompt)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        parsed = json.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        parsed = {}

    intent = parsed.get("intent", "general_answer")
    response_message = parsed.get("response_message", "I can help you manage your documents and data. Try asking me to list your documents, count analyses, or delete a specific file.")
    result_data = parsed.get("data")
    action_taken = None

    if intent == "delete_document":
        target_name = parsed.get("target_doc_name", "")
        if target_name:
            for doc in docs:
                if target_name.lower() in doc.filename.lower():
                    try:
                        from services.rag_service import delete_collection
                        await delete_collection(f"doc_{doc.id}")
                    except Exception:
                        pass
                    await db.delete(doc)
                    await db.commit()
                    response_message = f"Done! I've deleted '{doc.filename}' from your knowledge base."
                    action_taken = {"type": "delete", "document": doc.filename}
                    break
            else:
                response_message = f"I couldn't find a document matching '{target_name}'. Check your document list and try again."

    elif intent == "list_documents":
        result_data = [{"id": d.id, "filename": d.filename, "status": d.status, "uploaded_at": str(d.uploaded_at)} for d in docs]

    elif intent == "show_stats":
        result_data = {
            "documents": len(docs),
            "analyses": analyses_count,
            "chat_sessions": sessions_count,
        }

    return {
        "intent": intent,
        "message": response_message,
        "data": result_data,
        "action_taken": action_taken,
    }
