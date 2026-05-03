import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, Float, Text, DateTime,
    ForeignKey, JSON, BigInteger
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    avatar_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_login_at = Column(DateTime(timezone=True))
    total_analyses = Column(Integer, default=0)
    total_documents = Column(Integer, default=0)
    total_chats = Column(Integer, default=0)

    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"))
    token_hash = Column(String(255), unique=True)
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    is_revoked = Column(Boolean, default=False)
    user = relationship("User", back_populates="refresh_tokens")


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    ip_address = Column(String(50))
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_active_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    user = relationship("User", back_populates="sessions")


class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    filename = Column(String(500))
    file_type = Column(String(50))
    file_path = Column(String(500))
    row_count = Column(Integer)
    column_names = Column(JSON)
    column_types = Column(JSON)
    extraction_method = Column(String(100))
    pdf_page_count = Column(Integer)
    raw_text_preview = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    file_size_bytes = Column(BigInteger)
    deleted_at = Column(DateTime(timezone=True))


class Analysis(Base):
    __tablename__ = "analyses"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    data_source_id = Column(UUID(as_uuid=False), ForeignKey("data_sources.id"))
    user_query = Column(Text)
    selected_columns = Column(JSON)
    status = Column(String(50), default="pending")
    celery_task_id = Column(String(255))
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))

    results = relationship("AnalysisResult", back_populates="analysis", cascade="all, delete-orphan")
    charts = relationship("Chart", back_populates="analysis", cascade="all, delete-orphan")
    anomalies = relationship("Anomaly", back_populates="analysis", cascade="all, delete-orphan")
    agent_logs = relationship("AgentLog", back_populates="analysis", cascade="all, delete-orphan")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    analysis_id = Column(UUID(as_uuid=False), ForeignKey("analyses.id"))
    insights_json = Column(JSON)
    cleaning_report_json = Column(JSON)
    anomaly_report_json = Column(JSON)
    query_plan_json = Column(JSON)
    executive_summary = Column(Text)
    confidence_score = Column(Float)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    analysis = relationship("Analysis", back_populates="results")


class Chart(Base):
    __tablename__ = "charts"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    analysis_id = Column(UUID(as_uuid=False), ForeignKey("analyses.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    chart_type = Column(String(100))
    title = Column(String(500))
    caption = Column(Text)
    plotly_json = Column(JSON)
    png_base64 = Column(Text)
    chart_order = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    analysis = relationship("Analysis", back_populates="charts")


class Anomaly(Base):
    __tablename__ = "anomalies"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    analysis_id = Column(UUID(as_uuid=False), ForeignKey("analyses.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    column_name = Column(String(255))
    row_index = Column(Integer)
    row_date = Column(String(100))
    anomalous_value = Column(String(500))
    expected_range = Column(String(255))
    z_score = Column(Float)
    detection_method = Column(String(100))
    severity = Column(String(50))
    gemini_explanation = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    analysis = relationship("Analysis", back_populates="anomalies")


class AgentLog(Base):
    __tablename__ = "agent_logs"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    analysis_id = Column(UUID(as_uuid=False), ForeignKey("analyses.id"))
    agent_name = Column(String(100))
    step_number = Column(Integer)
    status = Column(String(50))
    input_summary = Column(Text)
    output_summary = Column(Text)
    duration_ms = Column(Integer)
    error = Column(Text)
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow)
    analysis = relationship("Analysis", back_populates="agent_logs")


class PdfReport(Base):
    __tablename__ = "pdf_reports"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    analysis_id = Column(UUID(as_uuid=False), ForeignKey("analyses.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    file_path = Column(String(500))
    page_count = Column(Integer)
    file_size_bytes = Column(BigInteger)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    filename = Column(String(500))
    file_type = Column(String(50))
    file_path = Column(String(500))
    page_count = Column(Integer)
    chunk_count = Column(Integer)
    embedding_model = Column(String(255))
    vector_collection_name = Column(String(255))
    status = Column(String(50), default="indexing")
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    file_size_bytes = Column(BigInteger)

    conversations = relationship("DocumentConversation", back_populates="document", cascade="all, delete-orphan")


class DocumentConversation(Base):
    __tablename__ = "document_conversations"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"))
    title = Column(String(500))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_message_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    document = relationship("Document", back_populates="conversations")
    messages = relationship("DocumentMessage", back_populates="conversation", cascade="all, delete-orphan")


class DocumentMessage(Base):
    __tablename__ = "document_messages"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    conversation_id = Column(UUID(as_uuid=False), ForeignKey("document_conversations.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    role = Column(String(20))
    content = Column(Text)
    sources = Column(JSON)
    tokens_used = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    conversation = relationship("DocumentConversation", back_populates="messages")


class YoutubeVideo(Base):
    __tablename__ = "youtube_videos"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    youtube_url = Column(String(500))
    video_id = Column(String(50))
    title = Column(String(500))
    channel = Column(String(255))
    duration_seconds = Column(Integer)
    transcript_language = Column(String(20))
    chunk_count = Column(Integer)
    vector_collection_name = Column(String(255))
    status = Column(String(50), default="indexing")
    thumbnail_url = Column(String(500))
    fetched_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    conversations = relationship("YoutubeConversation", back_populates="video", cascade="all, delete-orphan")


class YoutubeConversation(Base):
    __tablename__ = "youtube_conversations"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    video_id = Column(UUID(as_uuid=False), ForeignKey("youtube_videos.id"))
    title = Column(String(500))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_message_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    video = relationship("YoutubeVideo", back_populates="conversations")
    messages = relationship("YoutubeMessage", back_populates="conversation", cascade="all, delete-orphan")


class YoutubeMessage(Base):
    __tablename__ = "youtube_messages"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    conversation_id = Column(UUID(as_uuid=False), ForeignKey("youtube_conversations.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    role = Column(String(20))
    content = Column(Text)
    sources = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    conversation = relationship("YoutubeConversation", back_populates="messages")


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    title = Column(String(500))
    model = Column(String(100), default="gemini-1.5-flash")
    tools_enabled = Column(JSON)
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_message_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("chat_sessions.id"))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    role = Column(String(20))
    content = Column(Text)
    tool_calls = Column(JSON)
    tokens_used = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    session = relationship("ChatSession", back_populates="messages")


class HFInferenceLog(Base):
    __tablename__ = "hf_inference_logs"
    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    model_name = Column(String(255))
    task = Column(String(100))
    input_text = Column(Text)
    output_json = Column(JSON)
    duration_ms = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
