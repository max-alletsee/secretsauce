# backend/app/api/routes/users.py
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from httpx_oauth.clients.google import GoogleOAuth2

from app.core.config import settings
from app.core.security import (
    auth_backend,
    fastapi_users,
    get_jwt_strategy,
    get_user_manager,
)
from app.schemas.user import RefreshRequest, TokenResponse, UserCreate, UserRead, UserUpdate

# ── fastapi-users generated routers ──────────────────────────────────────────

auth_router = APIRouter()
auth_router.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/jwt")
auth_router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))
auth_router.include_router(fastapi_users.get_reset_password_router())
auth_router.include_router(fastapi_users.get_verify_router(UserRead))

# Google OAuth — only registered when credentials are configured
_google_oauth_client = GoogleOAuth2(
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
)

if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
    auth_router.include_router(
        fastapi_users.get_oauth_router(
            _google_oauth_client,
            auth_backend,
            settings.SECRET_KEY,
            associate_by_email=True,
            is_verified_by_default=True,
        ),
        prefix="/google",
    )

# get_users_router provides GET /me, PATCH /me, and superuser-only /{id} routes
users_router = fastapi_users.get_users_router(UserRead, UserUpdate)

# ── Custom login + refresh endpoints ─────────────────────────────────────────

_REFRESH_TOKEN_TYPE = "refresh"


def _create_refresh_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "type": _REFRESH_TOKEN_TYPE, "exp": expire},
        settings.SECRET_KEY,
        algorithm="HS256",
    )


def _decode_refresh_token(token: str) -> uuid.UUID:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if payload.get("type") != _REFRESH_TOKEN_TYPE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return uuid.UUID(payload["sub"])


@auth_router.post("/login", response_model=TokenResponse)
async def login_with_refresh(
    credentials: OAuth2PasswordRequestForm = Depends(),
    user_manager=Depends(get_user_manager),
) -> TokenResponse:
    """Login endpoint that returns both access and refresh tokens."""
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="LOGIN_BAD_CREDENTIALS")
    strategy = get_jwt_strategy()
    access_token = await strategy.write_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=_create_refresh_token(user.id),
    )


@auth_router.post("/token/refresh", response_model=TokenResponse)
async def refresh_access_token(
    body: RefreshRequest,
    user_manager=Depends(get_user_manager),
) -> TokenResponse:
    """Issue new tokens from a valid refresh token (refresh token rotates)."""
    user_id = _decode_refresh_token(body.refresh_token)
    user = await user_manager.get(user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    strategy = get_jwt_strategy()
    access_token = await strategy.write_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=_create_refresh_token(user.id),
    )
