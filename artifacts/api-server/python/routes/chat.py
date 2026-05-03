import uuid
import time
import json
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.db_models import ChatSession, ChatMessage, User
from models.schemas import ChatSessionCreate, ChatMessageRequest
from auth.dependencies import get_current_user
from services.tools_service import TOOLS, execute_tool
from services.gemini_client import generate_text

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = """You are DataMind AI — a highly capable AI assistant with access to 5 powerful tools.

Available tools:
- web_search: Search the internet for current information
- wikipedia: Look up encyclopedic information
- calculator: Evaluate mathematical expressions
- weather: Get current weather for any location
- url_summarizer: Fetch and summarize any webpage

To use a tool, respond with JSON in this exact format (on its own line):
TOOL_CALL: {"tool": "tool_name", "input": "your input here"}

After getting the tool result, incorporate it into your final answer.
If no tool is needed, just answer directly.
Always be helpful, accurate, and engaging."""


async def run_agent(message: str, history: list, tools_enabled: list) -> dict:
    messages_text = ""
    for msg in history[-20:]:
        role = "User" if msg.get("role") == "user" else "Assistant"
        messages_text += f"{role}: {msg.get('content', '')}\n"
    available_tools_desc = "\n".join([
        f"- {name}: {tool['description']}"
        for name, tool in TOOLS.items()
        if not tools_enabled or name in tools_enabled
    ])
    prompt = f"""{SYSTEM_PROMPT}

Enabled tools:
{available_tools_desc}

Conversation history:
{messages_text}

User: {message}
Assistant:"""

    tool_calls_made = []
    final_response = ""
    max_iterations = 5
    current_prompt = prompt

    for iteration in range(max_iterations):
        response = await generate_text(current_prompt)
        tool_match = re.search(r'TOOL_CALL:\s*(\{.*?\})', response, re.DOTALL)
        if tool_match:
            try:
                tool_data = json.loads(tool_match.group(1))
                tool_name = tool_data.get("tool")
                tool_input = tool_data.get("input", "")
                if tool_name and (not tools_enabled or tool_name in tools_enabled):
                    start_t = time.time()
                    tool_result = await execute_tool(tool_name, tool_input)
                    duration_ms = int((time.time() - start_t) * 1000)
                    tool_calls_made.append({"tool_name": tool_name, "input": tool_input, "output": tool_result[:500], "duration_ms": duration_ms})
                    current_prompt = current_prompt + response + f"\nTool result for {tool_name}: {tool_result}\nAssistant:"
                    continue
            except json.JSONDecodeError:
                pass
        clean = re.sub(r'TOOL_CALL:\s*\{.*?\}', '', response, flags=re.DOTALL).strip()
        final_response = clean if clean else response
        break

    if not final_response:
        final_response = await generate_text(f"Please answer this question directly: {message}")

    return {"response": final_response, "tool_calls": tool_calls_made, "tokens_used": len(final_response.split())}


@router.post("/sessions")
async def create_session(req: ChatSessionCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    all_tools = list(TOOLS.keys())
    session = ChatSession(
        id=str(uuid.uuid4()), user_id=current_user.id,
        title=req.title or "New Conversation",
        tools_enabled=req.tools_enabled or all_tools,
    )
    db.add(session)
    await db.commit()
    return {"session_id": session.id, "title": session.title, "tools_enabled": session.tools_enabled}


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, req: ChatMessageRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    msgs_result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).limit(20))
    history = [{"role": m.role, "content": m.content} for m in msgs_result.scalars().all()]
    user_msg = ChatMessage(id=str(uuid.uuid4()), session_id=session_id, user_id=current_user.id, role="user", content=req.message)
    db.add(user_msg)
    await db.flush()
    agent_result = await run_agent(req.message, history, session.tools_enabled or [])
    asst_msg = ChatMessage(
        id=str(uuid.uuid4()), session_id=session_id, user_id=current_user.id,
        role="assistant", content=agent_result["response"],
        tool_calls=agent_result["tool_calls"], tokens_used=agent_result["tokens_used"],
    )
    db.add(asst_msg)
    await db.execute(update(ChatSession).where(ChatSession.id == session_id).values(
        last_message_at=datetime.utcnow(),
        message_count=ChatSession.message_count + 2,
        title=session.title if session.title != "New Conversation" else req.message[:50],
    ))
    await db.execute(update(User).where(User.id == current_user.id).values(total_chats=User.total_chats + 1))
    await db.commit()
    return {"response": agent_result["response"], "tool_calls": agent_result["tool_calls"], "tokens_used": agent_result["tokens_used"], "session_id": session_id}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.user_id == current_user.id).order_by(ChatSession.last_message_at.desc()).limit(50))
    sessions = result.scalars().all()
    return [{"id": s.id, "title": s.title, "message_count": s.message_count, "tools_enabled": s.tools_enabled, "created_at": s.created_at, "last_message_at": s.last_message_at} for s in sessions]


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id, ChatMessage.user_id == current_user.id).order_by(ChatMessage.created_at))
    msgs = result.scalars().all()
    return [{"id": m.id, "role": m.role, "content": m.content, "tool_calls": m.tool_calls, "created_at": m.created_at} for m in msgs]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
