import asyncio
import logging
import os
from typing import List, Optional
import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
from config import settings
from services.gemini_client import generate_text

logger = logging.getLogger(__name__)

_embedding_fn = None
_chroma_client = None


def get_embedding_fn():
    global _embedding_fn
    if _embedding_fn is None:
        _embedding_fn = DefaultEmbeddingFunction()
        logger.info("ONNX embedding function loaded")
    return _embedding_fn


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(settings.chroma_db_path, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_db_path)
    return _chroma_client


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end >= len(words):
            break
        start = end - overlap
    return chunks


async def index_document(document_id: str, file_path: str, file_type: str, user_id: str) -> int:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _index_document_sync, document_id, file_path, file_type, user_id)


def _index_document_sync(document_id: str, file_path: str, file_type: str, user_id: str) -> int:
    ef = get_embedding_fn()
    client = get_chroma_client()
    text_by_page = {}
    try:
        ft = file_type.lower()
        if ft == "pdf":
            try:
                import fitz
                doc = fitz.open(file_path)
                for i, page in enumerate(doc):
                    text_by_page[i + 1] = page.get_text()
                doc.close()
            except Exception:
                import pdfplumber
                with pdfplumber.open(file_path) as pdf:
                    for i, page in enumerate(pdf.pages):
                        text_by_page[i + 1] = page.extract_text() or ""
        elif ft in ["txt", "md"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text_by_page[1] = f.read()
        elif ft in ["docx"]:
            from docx import Document
            doc = Document(file_path)
            full_text = "\n".join([p.text for p in doc.paragraphs])
            text_by_page[1] = full_text
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text_by_page[1] = f.read()
    except Exception as e:
        logger.error(f"Error extracting text from {file_path}: {e}")
        raise

    all_chunks = []
    all_metadatas = []
    all_ids = []
    chunk_idx = 0

    for page_num, text in text_by_page.items():
        if not text.strip():
            continue
        page_chunks = chunk_text(text)
        for chunk in page_chunks:
            if not chunk.strip():
                continue
            all_chunks.append(chunk)
            all_metadatas.append({
                "document_id": document_id,
                "page_number": page_num,
                "chunk_index": chunk_idx,
                "user_id": user_id,
            })
            all_ids.append(f"{document_id}_chunk_{chunk_idx}")
            chunk_idx += 1

    if not all_chunks:
        logger.warning(f"No text extracted from document {document_id}")
        return 0

    collection = client.get_or_create_collection(
        name=f"doc_{document_id}",
        embedding_function=ef,
    )
    batch_size = 100
    for i in range(0, len(all_chunks), batch_size):
        collection.add(
            documents=all_chunks[i:i + batch_size],
            metadatas=all_metadatas[i:i + batch_size],
            ids=all_ids[i:i + batch_size],
        )
    logger.info(f"Indexed {chunk_idx} chunks for document {document_id}")
    return chunk_idx


async def index_youtube(video_db_id: str, transcript_segments: list, user_id: str) -> int:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _index_youtube_sync, video_db_id, transcript_segments, user_id)


def _index_youtube_sync(video_db_id: str, transcript_segments: list, user_id: str) -> int:
    ef = get_embedding_fn()
    client = get_chroma_client()
    words_per_chunk = 500
    chunks = []
    metadatas = []
    ids = []
    current_words = []
    current_start = None
    current_end = None
    chunk_idx = 0

    for seg in transcript_segments:
        text = seg.get("text", "")
        start = seg.get("start", 0)
        duration = seg.get("duration", 0)
        words = text.split()
        if current_start is None:
            current_start = start
        current_words.extend(words)
        current_end = start + duration
        if len(current_words) >= words_per_chunk:
            chunk_text_str = " ".join(current_words)
            chunks.append(chunk_text_str)
            ts_str = _format_timestamp(current_start)
            metadatas.append({
                "video_id": video_db_id,
                "start_seconds": current_start,
                "end_seconds": current_end,
                "timestamp_str": ts_str,
                "user_id": user_id,
            })
            ids.append(f"{video_db_id}_chunk_{chunk_idx}")
            chunk_idx += 1
            current_words = []
            current_start = None

    if current_words:
        chunk_text_str = " ".join(current_words)
        chunks.append(chunk_text_str)
        ts_str = _format_timestamp(current_start or 0)
        metadatas.append({
            "video_id": video_db_id,
            "start_seconds": current_start or 0,
            "end_seconds": current_end or 0,
            "timestamp_str": ts_str,
            "user_id": user_id,
        })
        ids.append(f"{video_db_id}_chunk_{chunk_idx}")
        chunk_idx += 1

    if not chunks:
        return 0

    collection = client.get_or_create_collection(
        name=f"yt_{video_db_id}",
        embedding_function=ef,
    )
    collection.add(
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    return chunk_idx


def _format_timestamp(seconds: float) -> str:
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


async def retrieve(collection_name: str, query: str, top_k: int = 5, user_id: Optional[str] = None) -> list:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _retrieve_sync, collection_name, query, top_k, user_id)


def _retrieve_sync(collection_name: str, query: str, top_k: int = 5, user_id: Optional[str] = None) -> list:
    ef = get_embedding_fn()
    client = get_chroma_client()
    try:
        collection = client.get_collection(collection_name, embedding_function=ef)
    except Exception:
        return []
    where = {"user_id": user_id} if user_id else None
    results = collection.query(
        query_texts=[query],
        n_results=min(top_k, collection.count()),
        where=where,
        include=["documents", "metadatas", "distances"],
    )
    output = []
    if results["documents"]:
        for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
            output.append({
                "text": doc,
                "metadata": meta,
                "distance": dist,
                "similarity_score": max(0, 1 - dist),
            })
    return output


async def answer_with_rag(collection_name: str, query: str, conversation_history: list, source_type: str, user_id: str) -> dict:
    chunks = await retrieve(collection_name, query, top_k=5, user_id=user_id)
    if not chunks:
        chunks = await retrieve(collection_name, query, top_k=5, user_id=None)
    context_parts = []
    sources = []
    for i, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        if source_type == "youtube video":
            ts = meta.get("timestamp_str", "00:00")
            citation = f"[{ts}]"
            sources.append({"timestamp_str": ts, "text": chunk["text"][:200], "score": chunk["similarity_score"]})
        else:
            page = meta.get("page_number", 1)
            citation = f"[Page {page}]"
            sources.append({"page": page, "chunk_text": chunk["text"][:200], "score": chunk["similarity_score"]})
        context_parts.append(f"{citation} {chunk['text']}")
    context = "\n\n".join(context_parts)
    history_text = ""
    for msg in conversation_history[-5:]:
        role = "User" if msg.get("role") == "user" else "Assistant"
        history_text += f"{role}: {msg.get('content', '')}\n"
    prompt = f"""You are an AI assistant answering questions about a {source_type}.
Use ONLY the context below to answer. If the answer isn't in the context, say 'I couldn't find that in the document.'
Always cite your sources with [Page X] or [Timestamp MM:SS].

Context:
{context}

Conversation history:
{history_text}

User question: {query}

Answer with citations:"""
    answer = await generate_text(prompt)
    return {"answer": answer, "sources": sources, "tokens_used": len(prompt.split()) + len(answer.split())}


async def delete_collection(collection_name: str):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _delete_collection_sync, collection_name)


def _delete_collection_sync(collection_name: str):
    try:
        client = get_chroma_client()
        client.delete_collection(collection_name)
    except Exception as e:
        logger.warning(f"Could not delete collection {collection_name}: {e}")
