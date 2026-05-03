from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
from datetime import datetime
import re


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: Optional[str] = None

    @field_validator("email")
    def validate_email(cls, v):
        if "@" not in v or "." not in v:
            raise ValueError("Invalid email format")
        return v.lower()

    @field_validator("username")
    def validate_username(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", v):
            raise ValueError("Username must be 3-30 chars, alphanumeric + underscores only")
        return v

    @field_validator("password")
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    total_analyses: int
    total_documents: int
    total_chats: int

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    user_id: str
    email: str
    username: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    user: Optional[UserResponse] = None


class DocumentChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class DocumentChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    conversation_id: str
    conversation_title: Optional[str]


class YoutubeChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class YoutubeProcessRequest(BaseModel):
    url: str


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None
    tools_enabled: Optional[List[str]] = None


class ChatMessageRequest(BaseModel):
    message: str


class HFInferenceRequest(BaseModel):
    task: str
    input_text: Optional[str] = None
    text: Optional[str] = None  # alias for input_text
    extra_params: Optional[dict] = {}
    candidate_labels: Optional[List[str]] = None  # zero-shot labels

    def get_input_text(self) -> str:
        return self.input_text or self.text or ""

    def get_labels(self) -> List[str]:
        if self.candidate_labels:
            return self.candidate_labels
        if self.extra_params and "labels" in self.extra_params:
            return self.extra_params["labels"]
        return []


class AnalyzeRequest(BaseModel):
    data_source_id: str
    user_query: str
    selected_columns: Optional[List[str]] = None
