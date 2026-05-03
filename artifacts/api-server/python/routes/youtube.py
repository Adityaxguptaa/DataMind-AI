import uuid
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.db_models import YoutubeVideo, YoutubeConversation, YoutubeMessage, User
from models.schemas import YoutubeProcessRequest, YoutubeChatRequest
from auth.dependencies import get_current_user

router = APIRouter(prefix="/api/youtube", tags=["youtube"])


@router.post("/process")
async def process_youtube(req: YoutubeProcessRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from services.youtube_service import extract_video_id, fetch_transcript
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    existing = await db.execute(select(YoutubeVideo).where(YoutubeVideo.video_id == video_id, YoutubeVideo.user_id == current_user.id))
    existing_vid = existing.scalar_one_or_none()
    if existing_vid:
        return {"video_id": existing_vid.id, "youtube_video_id": video_id, "title": existing_vid.title, "channel": existing_vid.channel, "thumbnail_url": existing_vid.thumbnail_url, "duration_seconds": existing_vid.duration_seconds, "status": existing_vid.status}
    try:
        data = await fetch_transcript(video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcript extraction failed: {e}")
    vid = YoutubeVideo(
        id=str(uuid.uuid4()), user_id=current_user.id, youtube_url=req.url, video_id=video_id,
        title=data["title"], channel=data["channel"], thumbnail_url=data["thumbnail_url"],
        duration_seconds=data["total_duration_seconds"], transcript_language=data["language"],
        vector_collection_name=f"yt_{str(uuid.uuid4())}", status="indexing",
    )
    db.add(vid)
    await db.commit()
    await db.refresh(vid)
    asyncio.create_task(_index_youtube_bg(vid.id, data["transcript_segments"], current_user.id))
    return {"video_id": vid.id, "youtube_video_id": video_id, "title": vid.title, "channel": vid.channel, "thumbnail_url": vid.thumbnail_url, "duration_seconds": vid.duration_seconds, "word_count": data["word_count"], "status": "indexing"}


async def _index_youtube_bg(video_db_id: str, segments: list, user_id: str):
    from services.rag_service import index_youtube
    from database import AsyncSessionLocal
    try:
        chunk_count = await index_youtube(video_db_id, segments, user_id)
        async with AsyncSessionLocal() as db:
            await db.execute(update(YoutubeVideo).where(YoutubeVideo.id == video_db_id).values(chunk_count=chunk_count, status="ready"))
            await db.commit()
    except Exception as e:
        async with AsyncSessionLocal() as db:
            await db.execute(update(YoutubeVideo).where(YoutubeVideo.id == video_db_id).values(status="failed"))
            await db.commit()


@router.get("/{video_id}/status")
async def get_video_status(video_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(YoutubeVideo).where(YoutubeVideo.id == video_id, YoutubeVideo.user_id == current_user.id))
    vid = result.scalar_one_or_none()
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"status": vid.status, "chunk_count": vid.chunk_count, "ready": vid.status == "ready"}


@router.post("/{video_id}/chat")
async def chat_youtube(video_id: str, req: YoutubeChatRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(YoutubeVideo).where(YoutubeVideo.id == video_id, YoutubeVideo.user_id == current_user.id))
    vid = result.scalar_one_or_none()
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found")
    if vid.status != "ready":
        raise HTTPException(status_code=400, detail=f"Video is {vid.status}")
    conversation_id = req.conversation_id
    if not conversation_id:
        conv = YoutubeConversation(id=str(uuid.uuid4()), user_id=current_user.id, video_id=video_id, title=req.message[:50])
        db.add(conv)
        await db.flush()
        conversation_id = conv.id
    msgs_result = await db.execute(select(YoutubeMessage).where(YoutubeMessage.conversation_id == conversation_id).order_by(YoutubeMessage.created_at).limit(10))
    history = [{"role": m.role, "content": m.content} for m in msgs_result.scalars().all()]
    from services.rag_service import answer_with_rag
    rag_result = await answer_with_rag(f"yt_{video_id}", req.message, history, "youtube video", current_user.id)
    user_msg = YoutubeMessage(id=str(uuid.uuid4()), conversation_id=conversation_id, user_id=current_user.id, role="user", content=req.message)
    db.add(user_msg)
    asst_msg = YoutubeMessage(id=str(uuid.uuid4()), conversation_id=conversation_id, user_id=current_user.id, role="assistant", content=rag_result["answer"], sources=rag_result["sources"])
    db.add(asst_msg)
    await db.execute(update(YoutubeConversation).where(YoutubeConversation.id == conversation_id).values(last_message_at=datetime.utcnow()))
    await db.commit()
    return {"answer": rag_result["answer"], "sources": rag_result["sources"], "conversation_id": conversation_id}


@router.get("/{video_id}/summary")
async def get_video_summary(video_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(YoutubeVideo).where(YoutubeVideo.id == video_id, YoutubeVideo.user_id == current_user.id))
    vid = result.scalar_one_or_none()
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found")
    from services.rag_service import retrieve
    from services.gemini_client import generate_text
    chunks = await retrieve(f"yt_{video_id}", "main topics summary overview", top_k=8)
    context = "\n".join([c["text"] for c in chunks])
    prompt = f"""Analyze this YouTube video transcript and provide:
1. Overview (3 sentences)
2. Key topics (list of 5-7 topics)
3. Action items (list)
4. Memorable quotes (with timestamps if available)

Video: {vid.title}
Transcript excerpts:
{context[:3000]}

Respond in JSON format with keys: overview, key_topics, action_items, memorable_quotes"""
    try:
        import json
        response = await generate_text(prompt)
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except Exception:
        pass
    return {"overview": "Summary generation in progress.", "key_topics": [], "action_items": [], "memorable_quotes": []}


@router.get("")
async def list_videos(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(YoutubeVideo).where(YoutubeVideo.user_id == current_user.id).order_by(YoutubeVideo.fetched_at.desc()))
    vids = result.scalars().all()
    return [{"id": v.id, "title": v.title, "channel": v.channel, "thumbnail_url": v.thumbnail_url, "duration_seconds": v.duration_seconds, "status": v.status, "fetched_at": v.fetched_at} for v in vids]
