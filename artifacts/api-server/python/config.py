import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    neon_database_url: str = os.getenv("NEON_DATABASE_URL", "")
    neon_sync_database_url: str = os.getenv("NEON_SYNC_DATABASE_URL", "")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "datamind_super_secret_jwt_key_change_in_production_2024")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expiry_minutes: int = int(os.getenv("JWT_EXPIRY_MINUTES", "1440"))
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    huggingface_token: str = os.getenv("HUGGINGFACE_TOKEN", "")
    redis_url: str = os.getenv("UPSTASH_REDIS_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")
    reports_dir: str = os.getenv("REPORTS_DIR", "reports")
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
    cors_origins: str = "*"
    chroma_db_path: str = "./chroma_db"

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
