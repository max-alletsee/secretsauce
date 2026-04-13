# backend/app/core/logging.py
import base64
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def _extract_user_id(authorization: str) -> str | None:
    """Decode JWT payload (no signature verification) to get user_id for logging only."""
    if not authorization.startswith("Bearer "):
        return None
    parts = authorization[7:].split(".")
    if len(parts) != 3:
        return None
    try:
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        return payload.get("sub")
    except Exception:
        return None


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, log_file: str) -> None:
        super().__init__(app)
        self._log_file = Path(log_file)
        self._log_file.parent.mkdir(parents=True, exist_ok=True)

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        latency_ms = int((time.monotonic() - start) * 1000)

        status = response.status_code
        level = "ERROR" if status >= 500 else "WARN" if status >= 400 else "INFO"

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "method": request.method,
            "path": request.url.path,
            "status_code": status,
            "latency_ms": latency_ms,
            "user_id": _extract_user_id(request.headers.get("Authorization", "")),
        }
        try:
            with open(self._log_file, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except OSError:
            pass  # Never crash the app if logging fails
        return response
