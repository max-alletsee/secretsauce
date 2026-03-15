# backend/app/core/rate_limit.py
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Request
from fastapi.responses import JSONResponse

# Paths to rate-limit: 10 attempts per minute per client IP
_AUTH_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/jwt/login"}
_AUTH_LIMIT = 10
_AUTH_WINDOW = timedelta(minutes=1)

# In-memory store. Single-process only — migrate to Redis in Phase 10 hardening.
_auth_attempts: dict[str, list[datetime]] = defaultdict(list)


async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in _AUTH_PATHS:
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(timezone.utc)
        cutoff = now - _AUTH_WINDOW
        _auth_attempts[client_ip] = [t for t in _auth_attempts[client_ip] if t > cutoff]
        if len(_auth_attempts[client_ip]) >= _AUTH_LIMIT:
            return JSONResponse(
                {"detail": "Too many requests. Try again in a minute."},
                status_code=429,
            )
        _auth_attempts[client_ip].append(now)
    return await call_next(request)
