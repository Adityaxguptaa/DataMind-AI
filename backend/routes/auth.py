import hashlib
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.db_models import User, RefreshToken, UserSession
from models.schemas import RegisterRequest, LoginRequest, RefreshRequest, ProfileUpdateRequest, UserResponse, AuthResponse, TokenResponse
from auth.jwt_handler import create_access_token, create_refresh_token, verify_token
from auth.password import hash_password, verify_password
from auth.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_user = await db.execute(select(User).where(User.username == req.username))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        username=req.username,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    await db.flush()
    access_token = create_access_token(user.id, user.email, user.username)
    refresh_token_str, jti = create_refresh_token(user.id)
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    rt = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(rt)
    await db.commit()
    return AuthResponse(
        user_id=user.id, email=user.email, username=user.username,
        access_token=access_token, refresh_token=refresh_token_str,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.utcnow()))
    access_token = create_access_token(user.id, user.email, user.username)
    refresh_token_str, jti = create_refresh_token(user.id)
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    rt = RefreshToken(
        id=str(uuid.uuid4()), user_id=user.id, token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(rt)
    session = UserSession(
        id=str(uuid.uuid4()), user_id=user.id,
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent", ""),
    )
    db.add(session)
    await db.commit()
    user_data = UserResponse(
        id=user.id, email=user.email, username=user.username,
        full_name=user.full_name, avatar_url=user.avatar_url,
        is_active=user.is_active, is_verified=user.is_verified,
        created_at=user.created_at, last_login_at=user.last_login_at,
        total_analyses=user.total_analyses, total_documents=user.total_documents,
        total_chats=user.total_chats,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token_str, user=user_data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = verify_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    token_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    rt = result.scalar_one_or_none()
    if not rt or rt.is_revoked or rt.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")
    user_id = payload["sub"]
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    await db.execute(update(RefreshToken).where(RefreshToken.id == rt.id).values(is_revoked=True))
    new_access = create_access_token(user.id, user.email, user.username)
    new_refresh, _ = create_refresh_token(user.id)
    new_hash = hashlib.sha256(new_refresh.encode()).hexdigest()
    new_rt = RefreshToken(
        id=str(uuid.uuid4()), user_id=user.id, token_hash=new_hash,
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(new_rt)
    await db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    await db.execute(update(RefreshToken).where(RefreshToken.token_hash == token_hash).values(is_revoked=True))
    await db.commit()
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id, email=current_user.email, username=current_user.username,
        full_name=current_user.full_name, avatar_url=current_user.avatar_url,
        is_active=current_user.is_active, is_verified=current_user.is_verified,
        created_at=current_user.created_at, last_login_at=current_user.last_login_at,
        total_analyses=current_user.total_analyses, total_documents=current_user.total_documents,
        total_chats=current_user.total_chats,
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile(req: ProfileUpdateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    updates = {}
    if req.full_name is not None:
        updates["full_name"] = req.full_name
    if req.username is not None:
        existing = await db.execute(select(User).where(User.username == req.username, User.id != current_user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username taken")
        updates["username"] = req.username
    if updates:
        await db.execute(update(User).where(User.id == current_user.id).values(**updates))
        await db.commit()
        await db.refresh(current_user)
    return UserResponse(
        id=current_user.id, email=current_user.email, username=current_user.username,
        full_name=current_user.full_name, avatar_url=current_user.avatar_url,
        is_active=current_user.is_active, is_verified=current_user.is_verified,
        created_at=current_user.created_at, last_login_at=current_user.last_login_at,
        total_analyses=current_user.total_analyses, total_documents=current_user.total_documents,
        total_chats=current_user.total_chats,
    )
