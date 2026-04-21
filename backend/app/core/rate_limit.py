# backend/app/core/rate_limit.py
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings

# Paths to rate-limit: 10 attempts per minute per client IP
_AUTH_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/jwt/login"}
_AUTH_LIMIT = 10
_AUTH_WINDOW = timedelta(minutes=1)

# In-memory stores. Single-process only — migrate to Redis in Phase 10 hardening.
_auth_attempts: dict[str, list[datetime]] = defaultdict(list)

# Per-user import rate limit: 100 requests per hour
_IMPORT_LIMIT = 100
_IMPORT_WINDOW = timedelta(hours=1)
_import_attempts: dict[str, list[datetime]] = defaultdict(list)


async def rate_limit_middleware(request: Request, call_next):
    if settings.RATE_LIMIT_DISABLED:
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)

    if request.url.path in _AUTH_PATHS:
        cutoff = now - _AUTH_WINDOW
        _auth_attempts[client_ip] = [t for t in _auth_attempts[client_ip] if t > cutoff]
        if len(_auth_attempts[client_ip]) >= _AUTH_LIMIT:
            return JSONResponse(
                {"detail": "Too many requests. Try again in a minute."},
                status_code=429,
            )
        _auth_attempts[client_ip].append(now)

    return await call_next(request)


def check_import_rate_limit(user_id: str) -> None:
    """Check and record an import attempt for the given user ID.

    Raises HTTP 429 if the user has exceeded 100 requests/hour.
    """
    from fastapi import HTTPException
    now = datetime.now(timezone.utc)
    cutoff = now - _IMPORT_WINDOW
    _import_attempts[user_id] = [t for t in _import_attempts[user_id] if t > cutoff]
    if len(_import_attempts[user_id]) >= _IMPORT_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Too many import requests. Try again later.",
        )
    _import_attempts[user_id].append(now)
