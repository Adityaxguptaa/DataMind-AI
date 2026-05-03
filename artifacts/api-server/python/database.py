from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import create_engine
from config import settings
import logging
import re

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _make_async_url(url: str) -> str:
    """Convert postgres:// or postgresql:// URL to asyncpg-compatible postgresql+asyncpg:// URL."""
    url = re.sub(r'^postgres://', 'postgresql+asyncpg://', url)
    url = re.sub(r'^postgresql://', 'postgresql+asyncpg://', url)
    # Remove sslmode param — asyncpg handles SSL via connect_args
    url = re.sub(r'[?&]sslmode=[^&]*', '', url)
    url = re.sub(r'\?$', '', url)
    url = re.sub(r'&$', '', url)
    return url


def _make_sync_url(url: str) -> str:
    """Convert postgres:// or postgresql+asyncpg:// URL to psycopg2-compatible URL."""
    url = re.sub(r'^postgres://', 'postgresql://', url)
    url = re.sub(r'^postgresql\+asyncpg://', 'postgresql://', url)
    return url


def get_async_engine():
    url = settings.neon_database_url
    if not url:
        raise ValueError("NEON_DATABASE_URL not set")
    async_url = _make_async_url(url)
    return create_async_engine(
        async_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        echo=False,
        connect_args={"ssl": "require"},
    )


def get_sync_engine():
    url = settings.neon_sync_database_url or settings.neon_database_url
    if not url:
        raise ValueError("NEON_DATABASE_URL not set")
    sync_url = _make_sync_url(url)
    return create_engine(
        sync_url,
        pool_pre_ping=True,
        echo=False,
        connect_args={"sslmode": "require"},
    )


async_engine = get_async_engine()
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    from models.db_models import Base as ModelBase
    async with async_engine.begin() as conn:
        await conn.run_sync(ModelBase.metadata.create_all)
    logger.info("Database tables created/verified")
