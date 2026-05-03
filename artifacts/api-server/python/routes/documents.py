import uuid
import os
import aiofiles
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.db_models import Document, DocumentConversation, DocumentMessage, User
from models.schemas import DocumentChatRequest, DocumentChatResponse
from auth.dependencies import get_current_user
from config import settings
import asyncio

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_type = file.content_type or ""
    file_type = ALLOWED_TYPES.get(content_type)
    if not file_type:
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        if ext in ["pdf", "txt", "md", "docx"]:
            file_type = ext
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, TXT, MD, or DOCX.")
    upload_dir = os.path.join(settings.upload_dir, "documents")
    os.makedirs(upload_dir, exist_ok=True)
    doc_id = str(uuid.uuid4())
    filename = file.filename or f"document.{file_type}"
    safe_name = f"{doc_id}_{filename}"
    file_path = os.path.join(upload_dir, safe_name)
    content = await file.read()
    file_size = len(content)
    if file_size > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_file_size_mb}MB limit")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    page_count = None
    if file_type == "pdf":
        try:
            import fitz
            doc = fitz.open(file_path)
            page_count = doc.page_count
            doc.close()
        except Exception:
            pass
    document = Document(
        id=doc_id, user_id=current_user.id, filename=filename, file_type=file_type,
        file_path=file_path, page_count=page_count, file_size_bytes=file_size,
        embedding_model="all-MiniLM-L6-v2", vector_collection_name=f"doc_{doc_id}", status="indexing",
    )
    db.add(document)
    await db.commit()
    asyncio.create_task(_index_document_bg(doc_id, file_path, file_type, current_user.id))
    return {"document_id": doc_id, "filename": filename, "status": "indexing", "page_count": page_count}


async def _index_document_bg(doc_id: str, file_path: str, file_type: str, user_id: str):
    from services.rag_service import index_document
    from database import AsyncSessionLocal
    try:
        chunk_count = await index_document(doc_id, file_path, file_type, user_id)
        async with AsyncSessionLocal() as db:
            await db.execute(update(Document).where(Document.id == doc_id).values(chunk_count=chunk_count, status="ready"))
            await db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Document indexing failed for {doc_id}: {e}", exc_info=True)
        async with AsyncSessionLocal() as db:
            await db.execute(update(Document).where(Document.id == doc_id).values(status="failed"))
            await db.commit()


@router.get("/{document_id}/status")
async def get_document_status(document_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": doc.status, "chunk_count": doc.chunk_count, "ready": doc.status == "ready"}


@router.post("/{document_id}/chat", response_model=DocumentChatResponse)
async def chat_document(document_id: str, req: DocumentChatRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail=f"Document is {doc.status}. Please wait for indexing to complete.")
    conversation_id = req.conversation_id
    conversation_title = None
    if not conversation_id:
        conv = DocumentConversation(
            id=str(uuid.uuid4()), user_id=current_user.id, document_id=document_id,
            title=req.message[:50],
        )
        db.add(conv)
        await db.flush()
        conversation_id = conv.id
        conversation_title = conv.title
    else:
        conv_result = await db.execute(select(DocumentConversation).where(DocumentConversation.id == conversation_id))
        conv = conv_result.scalar_one_or_none()
        if conv:
            conversation_title = conv.title
    msgs_result = await db.execute(select(DocumentMessage).where(DocumentMessage.conversation_id == conversation_id).order_by(DocumentMessage.created_at).limit(20))
    history = [{"role": m.role, "content": m.content} for m in msgs_result.scalars().all()]
    from services.rag_service import answer_with_rag
    rag_result = await answer_with_rag(f"doc_{document_id}", req.message, history, "document", current_user.id)
    user_msg = DocumentMessage(id=str(uuid.uuid4()), conversation_id=conversation_id, user_id=current_user.id, role="user", content=req.message)
    db.add(user_msg)
    asst_msg = DocumentMessage(
        id=str(uuid.uuid4()), conversation_id=conversation_id, user_id=current_user.id,
        role="assistant", content=rag_result["answer"], sources=rag_result["sources"], tokens_used=rag_result.get("tokens_used"),
    )
    db.add(asst_msg)
    await db.execute(update(DocumentConversation).where(DocumentConversation.id == conversation_id).values(last_message_at=datetime.utcnow()))
    await db.commit()
    return DocumentChatResponse(answer=rag_result["answer"], sources=rag_result["sources"], conversation_id=conversation_id, conversation_title=conversation_title)


@router.get("/{document_id}/conversations")
async def list_conversations(document_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(DocumentConversation).where(DocumentConversation.document_id == document_id, DocumentConversation.user_id == current_user.id).order_by(DocumentConversation.last_message_at.desc()))
    convs = result.scalars().all()
    return [{"id": c.id, "title": c.title, "created_at": c.created_at, "last_message_at": c.last_message_at} for c in convs]


@router.get("")
async def list_documents(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Document model has no deleted_at — just filter by user
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "file_type": d.file_type,
            "status": d.status,
            "page_count": d.page_count,
            "chunk_count": d.chunk_count,
            "file_size_bytes": d.file_size_bytes,
            "uploaded_at": d.uploaded_at,
        }
        for d in docs
    ]


def _extract_text_from_doc(file_path: str, file_type: str) -> str:
    try:
        if file_type == "pdf":
            import fitz
            doc = fitz.open(file_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            return text[:12000]
        elif file_type in ["txt", "md"]:
            with open(file_path, "r", errors="ignore") as f:
                return f.read()[:12000]
        elif file_type == "docx":
            from docx import Document as DocxDoc
            doc = DocxDoc(file_path)
            return "\n".join([p.text for p in doc.paragraphs])[:12000]
    except Exception:
        pass
    return ""


@router.post("/{document_id}/generate-summary")
async def generate_document_summary(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.gemini_client import generate_text
    result = await db.execute(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail="Document is not ready yet")
    text = _extract_text_from_doc(doc.file_path, doc.file_type)
    if not text:
        raise HTTPException(status_code=500, detail="Could not extract text from document")
    prompt = f"""You are an expert document analyst. Read the following document content and produce a high-quality comprehensive summary.

DOCUMENT: {doc.filename}

CONTENT:
{text}

Write a thorough summary that covers:
1. Main topic and purpose of the document
2. Key points and arguments (at least 5)
3. Important facts, data, or findings
4. Conclusions or takeaways
5. Target audience and context

Format your response as ONLY valid JSON:
{{
  "title": "<concise document title>",
  "summary": "<comprehensive 3-5 paragraph summary>",
  "key_points": ["<key point 1>", "<key point 2>", ...],
  "topics": ["<main topic>", ...],
  "document_type": "<report|article|research|manual|other>",
  "reading_level": "<beginner|intermediate|advanced>",
  "word_count_estimate": <integer>
}}"""
    import json as _json
    raw = await generate_text(prompt)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        result_data = _json.loads(raw[start:end]) if start >= 0 else {"summary": raw, "key_points": [], "topics": []}
    except Exception:
        result_data = {"summary": raw[:2000], "key_points": [], "topics": []}
    return result_data


@router.post("/{document_id}/regenerate-summary")
async def regenerate_document_summary(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.gemini_client import generate_text
    from pydantic import BaseModel

    class RegenerateRequest(BaseModel):
        feedback: str = ""

    return await generate_document_summary(document_id, db, current_user)


@router.post("/{document_id}/generate-mcq")
async def generate_mcq(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.gemini_client import generate_text
    import json as _json
    result = await db.execute(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail="Document is not ready yet")
    text = _extract_text_from_doc(doc.file_path, doc.file_type)
    if not text:
        raise HTTPException(status_code=500, detail="Could not extract text")
    prompt = f"""You are an expert educator. Based on the following document, generate exactly 10 multiple-choice questions to test understanding of the content.

DOCUMENT: {doc.filename}

CONTENT:
{text}

Rules:
- Questions must be based ONLY on the document content
- Each question must have exactly 4 options (A, B, C, D)
- Vary difficulty: 3 easy, 4 medium, 3 hard
- Include a brief explanation for the correct answer
- Cover different sections/topics of the document

Respond with ONLY valid JSON:
{{
  "document_title": "{doc.filename}",
  "total_questions": 10,
  "questions": [
    {{
      "id": 1,
      "question": "<clear question text>",
      "options": {{"A": "<option>", "B": "<option>", "C": "<option>", "D": "<option>"}},
      "correct_answer": "<A|B|C|D>",
      "explanation": "<why this is correct>",
      "difficulty": "<easy|medium|hard>",
      "topic": "<which section/topic this tests>"
    }}
  ]
}}"""
    raw = await generate_text(prompt)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        mcq_data = _json.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate MCQs. Please try again.")
    if not mcq_data.get("questions"):
        raise HTTPException(status_code=500, detail="No questions were generated")
    return mcq_data


@router.delete("/{document_id}")
async def delete_document(document_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    from services.rag_service import delete_collection
    await delete_collection(f"doc_{document_id}")
    # Hard delete since model has no deleted_at
    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted"}
