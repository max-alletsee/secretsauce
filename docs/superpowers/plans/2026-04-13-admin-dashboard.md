# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a superuser-only admin dashboard covering user management (list, activate/deactivate, promote/demote, delete) and log access (structured app logs, AI call logs, audit trail).

**Architecture:** Backend adds two DB tables (`AICallLog`, `AdminAuditLog`), a JSON request-logging middleware, a new `admin` service, and 8 new routes under `/api/v1/admin`. Frontend adds an `AdminLayout` with sidebar navigation, 4 views, 3 shared components, and 2 Pinia stores under `/admin/*` routes.

**Tech Stack:** FastAPI, SQLModel/SQLAlchemy async, Alembic, Vue 3 (Composition API), Pinia, TypeScript, Vitest, pytest/httpx

**Spec:** `docs/superpowers/specs/2026-04-13-admin-dashboard-design.md`

---

## File Map

**Backend — create:**
- `backend/app/models/admin.py` — AICallLog, AdminAuditLog SQLModel tables
- `backend/app/schemas/admin.py` — all admin Pydantic request/response models
- `backend/app/core/logging.py` — JSON request-logging middleware
- `backend/app/services/admin.py` — user management, log queries, audit writing
- `backend/alembic/versions/XXXX_add_admin_tables.py` — migration (auto-generated)

**Backend — modify:**
- `backend/app/core/config.py` — add `APP_LOG_FILE` setting
- `backend/app/main.py` — register logging middleware
- `backend/app/api/routes/admin.py` — replace stub with 8 routes
- `backend/app/services/ai_service.py` — write `AICallLog` after every Gemini call
- `backend/app/services/recipe_import_service.py` — pass `db`+`user_id` to AI calls
- `backend/app/services/meal_suggestion_service.py` — pass `db`+`user_id` to AI calls
- `backend/tests/conftest.py` — import new admin models so Alembic creates tables in test DB

**Frontend — create:**
- `frontend/src/types/admin.ts`
- `frontend/src/api/admin.ts`
- `frontend/src/stores/useAdminUsersStore.ts`
- `frontend/src/stores/useAdminUsersStore.test.ts`
- `frontend/src/stores/useAdminLogsStore.ts`
- `frontend/src/stores/useAdminLogsStore.test.ts`
- `frontend/src/components/admin/AdminLayout.vue`
- `frontend/src/components/admin/AdminUserRow.vue`
- `frontend/src/components/admin/AdminUserPicker.vue`
- `frontend/src/components/admin/LogFilterBar.vue`
- `frontend/src/views/admin/AdminUsersView.vue`
- `frontend/src/views/admin/AdminAppLogsView.vue`
- `frontend/src/views/admin/AdminAiLogsView.vue`
- `frontend/src/views/admin/AdminAuditLogView.vue`

**Frontend — modify:**
- `frontend/src/router/index.ts` — add `/admin/*` child routes

---

## Task 1: DB Models

**Files:**
- Create: `backend/app/models/admin.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write the models**

```python
# backend/app/models/admin.py
import uuid
from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class AICallLog(SQLModel, table=True):
    __tablename__ = "ai_call_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(sa.UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    call_type: str = Field(sa_column=Column(String(50), nullable=False, index=True))
    model: str = Field(sa_column=Column(String(100), nullable=False))
    prompt_summary: str = Field(sa_column=Column(String(200), nullable=False))
    latency_ms: int
    input_tokens: int
    output_tokens: int
    success: bool
    error_message: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )


class AdminAuditLog(SQLModel, table=True):
    __tablename__ = "admin_audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    admin_id: uuid.UUID = Field(
        sa_column=Column(sa.UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    action: str = Field(sa_column=Column(String(20), nullable=False, index=True))
    target_user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(sa.UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    details: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
```

- [ ] **Step 2: Register models in conftest so test DB creates the tables**

In `backend/tests/conftest.py`, add these two import lines after the existing model imports (around line 17):

```python
from app.models import admin as _admin_models  # noqa: F401 — registers AICallLog/AdminAuditLog in SQLModel.metadata
```

- [ ] **Step 3: Verify models import cleanly**

```bash
cd backend && python -c "from app.models.admin import AICallLog, AdminAuditLog; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd backend
git add app/models/admin.py tests/conftest.py
git commit -m "feat: add AICallLog and AdminAuditLog models"
```

---

## Task 2: Admin Schemas

**Files:**
- Create: `backend/app/schemas/admin.py`

- [ ] **Step 1: Write the schemas**

```python
# backend/app/schemas/admin.py
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    is_active: bool
    is_superuser: bool
    is_verified: bool
    preferred_units: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserStatsResponse(BaseModel):
    recipe_count: int
    meal_plan_count: int
    last_active: datetime | None  # max created_at across user's recipes and meal plans


class PaginatedAdminUsersResponse(BaseModel):
    items: list[AdminUserResponse]
    next_cursor: str | None
    has_more: bool


class AICallLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    call_type: str
    model: str
    prompt_summary: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    success: bool
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAICallLogResponse(BaseModel):
    items: list[AICallLogResponse]
    next_cursor: str | None
    has_more: bool


class AdminAuditLogResponse(BaseModel):
    id: uuid.UUID
    admin_id: uuid.UUID
    admin_email: str
    action: str
    target_user_id: uuid.UUID | None
    target_email: str | None
    details: dict[str, Any]
    description: str
    created_at: datetime


class PaginatedAuditLogResponse(BaseModel):
    items: list[AdminAuditLogResponse]
    next_cursor: str | None
    has_more: bool


class AppLogEntry(BaseModel):
    timestamp: str
    level: str
    method: str
    path: str
    status_code: int
    latency_ms: int
    user_id: str | None


class AppLogsResponse(BaseModel):
    items: list[AppLogEntry]
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from app.schemas.admin import AdminUserResponse; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/schemas/admin.py
git commit -m "feat: add admin schemas"
```

---

## Task 3: Config + Logging Middleware

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/core/logging.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add `APP_LOG_FILE` to config**

In `backend/app/core/config.py`, add after `DB_MAX_OVERFLOW`:

```python
    APP_LOG_FILE: str = "/var/log/secretsauce/app.log"
```

- [ ] **Step 2: Write the middleware**

```python
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
```

- [ ] **Step 3: Register the middleware in `main.py`**

Add this import near the top of `backend/app/main.py`:
```python
from app.core.logging import RequestLoggingMiddleware
```

Add this line **after** all other `add_middleware` / `middleware` calls (so it runs as the outermost layer and captures full request timing):
```python
app.add_middleware(RequestLoggingMiddleware, log_file=settings.APP_LOG_FILE)
```

- [ ] **Step 4: Verify the app still starts**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add app/core/config.py app/core/logging.py app/main.py
git commit -m "feat: add JSON request-logging middleware and APP_LOG_FILE config"
```

---

## Task 4: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/XXXX_add_admin_tables.py` (auto-generated)

- [ ] **Step 1: Generate the migration**

```bash
cd backend && alembic revision --autogenerate -m "add admin tables"
```

- [ ] **Step 2: Inspect the generated file**

Open the generated file in `backend/alembic/versions/`. Verify it contains:
- `op.create_table("ai_call_logs", ...)` with all columns: `id`, `user_id`, `call_type`, `model`, `prompt_summary`, `latency_ms`, `input_tokens`, `output_tokens`, `success`, `error_message`, `created_at`
- `op.create_table("admin_audit_logs", ...)` with all columns: `id`, `admin_id`, `action`, `target_user_id`, `details`, `created_at`
- FK constraints on `user_id`, `admin_id`, `target_user_id` → `users.id`
- Index creation for `user_id`, `call_type`, `created_at` on `ai_call_logs`
- Index creation for `admin_id`, `action`, `created_at` on `admin_audit_logs`
- A `downgrade()` that drops both tables

If anything is missing, edit the migration file to add it before applying.

- [ ] **Step 3: Apply the migration**

```bash
alembic upgrade head
```
Expected: output ends with `Running upgrade ... -> <new_rev>, add admin tables`

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/
git commit -m "feat: migration — add ai_call_logs and admin_audit_logs tables"
```

---

## Task 5: Admin Service — User Management

**Files:**
- Create: `backend/app/services/admin.py`
- Create: `backend/tests/unit/test_admin_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_admin_service.py
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog
from app.models.user import User
from app.services import admin as admin_service
from tests.conftest import unique_email


async def _make_user(db: AsyncSession, *, is_superuser: bool = False, is_active: bool = True) -> User:
    u = User(
        email=unique_email(),
        hashed_password="x",
        is_superuser=is_superuser,
        is_active=is_active,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.fixture
async def db_session(db_engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def test_list_users_returns_all(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    items, cursor, has_more = await admin_service.list_users(db_session)
    emails = [u.email for u in items]
    assert user.email in emails
    assert admin.email in emails
    assert has_more is False
    assert cursor is None


async def test_list_users_search_by_email(db_session):
    u = await _make_user(db_session)
    items, _, _ = await admin_service.list_users(db_session, search=u.email[:10])
    assert any(x.email == u.email for x in items)


async def test_list_users_status_filter(db_session):
    inactive = await _make_user(db_session, is_active=False)
    items, _, _ = await admin_service.list_users(db_session, status="inactive")
    assert all(not u.is_active for u in items)
    assert any(u.email == inactive.email for u in items)


async def test_list_users_cursor_pagination(db_session):
    # Create 3 users and paginate with limit=2
    for _ in range(3):
        await _make_user(db_session)
    page1, cursor, has_more = await admin_service.list_users(db_session, limit=2)
    assert len(page1) == 2
    assert has_more is True
    assert cursor is not None
    page2, cursor2, _ = await admin_service.list_users(db_session, cursor=cursor, limit=2)
    assert len(page2) >= 1
    ids_page1 = {u.id for u in page1}
    ids_page2 = {u.id for u in page2}
    assert ids_page1.isdisjoint(ids_page2)


async def test_get_user_stats_zero(db_session):
    user = await _make_user(db_session)
    stats = await admin_service.get_user_stats(db_session, user.id)
    assert stats.recipe_count == 0
    assert stats.meal_plan_count == 0
    assert stats.last_active is None


async def test_update_user_deactivate_writes_audit(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session, is_active=True)
    updated = await admin_service.update_user(db_session, user.id, admin, is_active=False)
    assert updated is not None
    assert updated.is_active is False
    from sqlalchemy import select
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "DEACTIVATE",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.details["email"] == user.email


async def test_update_user_promote_writes_audit(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    updated = await admin_service.update_user(db_session, user.id, admin, is_superuser=True)
    assert updated.is_superuser is True
    from sqlalchemy import select
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "PROMOTE",
        )
    )
    assert result.scalars().first() is not None


async def test_update_user_no_change_no_audit(db_session):
    from sqlalchemy import select
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session, is_active=True)
    before_count_result = await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.admin_id == admin.id)
    )
    before_count = len(before_count_result.scalars().all())
    await admin_service.update_user(db_session, user.id, admin, is_active=True)  # no change
    after_count_result = await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.admin_id == admin.id)
    )
    assert len(after_count_result.scalars().all()) == before_count


async def test_delete_user_removes_user_and_writes_audit(db_session):
    from sqlalchemy import select
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    user_email = user.email
    deleted = await admin_service.delete_user(db_session, user.id, admin)
    assert deleted is True
    assert await db_session.get(User, user.id) is None
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "DELETE",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.details["email"] == user_email


async def test_delete_user_not_found_returns_false(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    result = await admin_service.delete_user(db_session, uuid.uuid4(), admin)
    assert result is False
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend && pytest tests/unit/test_admin_service.py -v 2>&1 | head -30
```
Expected: `ModuleNotFoundError` or `ImportError` — `admin_service` doesn't exist yet.

- [ ] **Step 3: Implement the service**

```python
# backend/app/services/admin.py
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog, AICallLog
from app.models.meal_plan import MealPlan
from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.admin import (
    AdminAuditLogResponse,
    AppLogEntry,
    UserStatsResponse,
)


# ── User management ──────────────────────────────────────────────────────────

async def list_users(
    db: AsyncSession,
    *,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[User], str | None, bool]:
    """Return (items, next_cursor, has_more). cursor = '{iso}|{id}'."""
    stmt = select(User).order_by(User.created_at.desc(), User.id.desc())

    if search:
        term = f"%{search.lower()}%"
        stmt = stmt.where(
            (func.lower(User.email).like(term)) | (func.lower(User.display_name).like(term))
        )
    if status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    if role == "superuser":
        stmt = stmt.where(User.is_superuser.is_(True))
    elif role == "user":
        stmt = stmt.where(User.is_superuser.is_(False))

    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (User.created_at < cursor_time)
            | ((User.created_at == cursor_time) & (User.id < cursor_id))
        )

    result = await db.execute(stmt.limit(limit + 1))
    rows = list(result.scalars())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last = items[-1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return items, next_cursor, has_more


async def get_user_stats(db: AsyncSession, user_id: uuid.UUID) -> UserStatsResponse:
    recipe_count = (
        await db.execute(select(func.count()).select_from(Recipe).where(Recipe.owner_id == user_id))
    ).scalar_one()
    meal_count = (
        await db.execute(select(func.count()).select_from(MealPlan).where(MealPlan.user_id == user_id))
    ).scalar_one()

    recipe_max = (
        await db.execute(select(func.max(Recipe.created_at)).where(Recipe.owner_id == user_id))
    ).scalar_one_or_none()
    meal_max = (
        await db.execute(select(func.max(MealPlan.created_at)).where(MealPlan.user_id == user_id))
    ).scalar_one_or_none()

    candidates = [t for t in [recipe_max, meal_max] if t is not None]
    return UserStatsResponse(
        recipe_count=recipe_count,
        meal_plan_count=meal_count,
        last_active=max(candidates) if candidates else None,
    )


async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    admin: User,
    *,
    is_active: bool | None = None,
    is_superuser: bool | None = None,
) -> User | None:
    user = await db.get(User, user_id)
    if user is None:
        return None
    changed = False
    if is_active is not None and is_active != user.is_active:
        user.is_active = is_active
        await write_audit_log(
            db, admin_id=admin.id,
            action="ACTIVATE" if is_active else "DEACTIVATE",
            target_user_id=user_id, details={"email": user.email},
        )
        changed = True
    if is_superuser is not None and is_superuser != user.is_superuser:
        user.is_superuser = is_superuser
        await write_audit_log(
            db, admin_id=admin.id,
            action="PROMOTE" if is_superuser else "DEMOTE",
            target_user_id=user_id, details={"email": user.email},
        )
        changed = True
    if changed:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: uuid.UUID, admin: User) -> bool:
    user = await db.get(User, user_id)
    if user is None:
        return False
    details = {"email": user.email, "deleted_user_id": str(user_id)}
    # target_user_id=None to avoid FK constraint when the user row is deleted
    await write_audit_log(db, admin_id=admin.id, action="DELETE", target_user_id=None, details=details)
    await db.delete(user)
    await db.commit()
    return True


async def write_audit_log(
    db: AsyncSession,
    *,
    admin_id: uuid.UUID,
    action: str,
    target_user_id: uuid.UUID | None = None,
    details: dict[str, Any],
) -> None:
    """Add an audit log entry to the session. Caller is responsible for committing."""
    db.add(AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_user_id=target_user_id,
        details=details,
        created_at=datetime.now(timezone.utc),
    ))


# ── Log queries ───────────────────────────────────────────────────────────────

async def get_app_logs(
    *,
    level: str | None = None,
    user_id: str | None = None,
    limit: int = 100,
    log_file: str,
) -> list[AppLogEntry]:
    import json as _json

    path = Path(log_file)
    if not path.exists():
        return []
    matching: deque[AppLogEntry] = deque(maxlen=limit)
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = _json.loads(line)
                if level and data.get("level") != level:
                    continue
                if user_id and data.get("user_id") != user_id:
                    continue
                matching.append(AppLogEntry(**{k: data.get(k) for k in AppLogEntry.model_fields}))
            except Exception:
                continue
    return list(matching)


async def get_ai_logs(
    db: AsyncSession,
    *,
    call_type: str | None = None,
    success: bool | None = None,
    user_id: uuid.UUID | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[AICallLog], str | None, bool]:
    stmt = select(AICallLog).order_by(AICallLog.created_at.desc(), AICallLog.id.desc())
    if call_type:
        stmt = stmt.where(AICallLog.call_type == call_type)
    if success is not None:
        stmt = stmt.where(AICallLog.success.is_(success))
    if user_id:
        stmt = stmt.where(AICallLog.user_id == user_id)
    if since:
        stmt = stmt.where(AICallLog.created_at >= since)
    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (AICallLog.created_at < cursor_time)
            | ((AICallLog.created_at == cursor_time) & (AICallLog.id < cursor_id))
        )
    result = await db.execute(stmt.limit(limit + 1))
    rows = list(result.scalars())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last = items[-1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return items, next_cursor, has_more


async def get_audit_logs(
    db: AsyncSession,
    *,
    action: str | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[AdminAuditLogResponse], str | None, bool]:
    from sqlalchemy.orm import aliased

    AdminUser = aliased(User)
    TargetUser = aliased(User)

    stmt = (
        select(
            AdminAuditLog,
            AdminUser.email.label("admin_email"),
            TargetUser.email.label("target_email"),
        )
        .join(AdminUser, AdminAuditLog.admin_id == AdminUser.id)
        .outerjoin(TargetUser, AdminAuditLog.target_user_id == TargetUser.id)
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
    )
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
    if since:
        stmt = stmt.where(AdminAuditLog.created_at >= since)
    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (AdminAuditLog.created_at < cursor_time)
            | ((AdminAuditLog.created_at == cursor_time) & (AdminAuditLog.id < cursor_id))
        )
    result = await db.execute(stmt.limit(limit + 1))
    rows = result.all()
    has_more = len(rows) > limit
    raw = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last_log = raw[-1][0]
        next_cursor = f"{last_log.created_at.isoformat()}|{last_log.id}"

    items = [
        AdminAuditLogResponse(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=admin_email,
            action=log.action,
            target_user_id=log.target_user_id,
            target_email=target_email,
            details=log.details,
            description=_format_audit_description(log.action, target_email, log.details),
            created_at=log.created_at,
        )
        for log, admin_email, target_email in raw
    ]
    return items, next_cursor, has_more


def _format_audit_description(action: str, target_email: str | None, details: dict) -> str:
    email = target_email or details.get("email", "unknown")
    match action:
        case "PROMOTE":    return f"Promoted {email} to superuser"
        case "DEMOTE":     return f"Demoted {email} from superuser"
        case "ACTIVATE":   return f"Activated {email}"
        case "DEACTIVATE": return f"Deactivated {email}"
        case "DELETE":     return f"Deleted user {details.get('email', 'unknown')}"
        case "CLEANUP":    return f"Ran cleanup — {details.get('deleted_count', 0)} files deleted"
        case _:            return f"{action}: {email}"
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && pytest tests/unit/test_admin_service.py -v
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/admin.py tests/unit/test_admin_service.py
git commit -m "feat: admin service — user management, log queries, audit logging"
```

---

## Task 6: Admin Routes

**Files:**
- Modify: `backend/app/api/routes/admin.py`
- Create: `backend/tests/integration/test_admin_routes.py`

- [ ] **Step 1: Write failing integration tests**

```python
# backend/tests/integration/test_admin_routes.py
import pytest
from httpx import AsyncClient

from tests.conftest import unique_email


async def _register(client: AsyncClient, email: str, password: str = "Pass123!") -> dict:
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.json()
    return r.json()


async def _login(client: AsyncClient, email: str, password: str = "Pass123!") -> str:
    r = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, r.json()
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── User list ─────────────────────────────────────────────────────────────────

async def test_list_users_requires_superuser(client, superuser_token):
    regular_email = unique_email("regular")
    await _register(client, regular_email)
    regular_token = await _login(client, regular_email)
    r = await client.get("/api/v1/admin/users", headers=_auth(regular_token))
    assert r.status_code == 403

    r = await client.get("/api/v1/admin/users", headers=_auth(superuser_token))
    assert r.status_code == 200


async def test_list_users_returns_paginated_response(client, superuser_token):
    r = await client.get("/api/v1/admin/users", headers=_auth(superuser_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "next_cursor" in body
    assert "has_more" in body


async def test_list_users_search(client, superuser_token):
    email = unique_email("searchable")
    await _register(client, email)
    r = await client.get(
        "/api/v1/admin/users", params={"search": email[:15]}, headers=_auth(superuser_token)
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()["items"]]
    assert email in emails


# ── Update user ───────────────────────────────────────────────────────────────

async def test_patch_user_deactivate(client, superuser_token):
    email = unique_email("patchme")
    user = await _register(client, email)
    user_id = user["id"]

    r = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False


async def test_patch_user_promote(client, superuser_token):
    email = unique_email("promoteme")
    user = await _register(client, email)
    r = await client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_superuser": True},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    assert r.json()["is_superuser"] is True


async def test_patch_user_not_found(client, superuser_token):
    r = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 404


# ── Delete user ───────────────────────────────────────────────────────────────

async def test_delete_user(client, superuser_token):
    email = unique_email("deleteme")
    user = await _register(client, email)
    r = await client.delete(
        f"/api/v1/admin/users/{user['id']}", headers=_auth(superuser_token)
    )
    assert r.status_code == 204

    # Confirm gone
    r2 = await client.get("/api/v1/admin/users", params={"search": email}, headers=_auth(superuser_token))
    assert not any(u["email"] == email for u in r2.json()["items"])


async def test_delete_user_not_found(client, superuser_token):
    r = await client.delete(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
        headers=_auth(superuser_token),
    )
    assert r.status_code == 404


# ── User stats ────────────────────────────────────────────────────────────────

async def test_get_user_stats(client, superuser_token):
    email = unique_email("stats")
    user = await _register(client, email)
    r = await client.get(
        f"/api/v1/admin/users/{user['id']}/stats", headers=_auth(superuser_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["recipe_count"] == 0
    assert body["meal_plan_count"] == 0
    assert body["last_active"] is None


# ── Cleanup ───────────────────────────────────────────────────────────────────

async def test_cleanup_writes_audit_log(client, superuser_token, db_engine):
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.admin import AdminAuditLog

    r = await client.post("/api/v1/admin/cleanup", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert "deleted_count" in r.json()

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "CLEANUP")
        )
        assert result.scalars().first() is not None


# ── Log routes ────────────────────────────────────────────────────────────────

async def test_get_app_logs(client, superuser_token, tmp_path, monkeypatch):
    import json
    from app.core import config as cfg
    log_file = tmp_path / "app.log"
    log_file.write_text(
        json.dumps({"timestamp": "2026-04-13T00:00:00Z", "level": "INFO",
                    "method": "GET", "path": "/api/v1/recipes",
                    "status_code": 200, "latency_ms": 5, "user_id": None}) + "\n"
    )
    monkeypatch.setattr(cfg.settings, "APP_LOG_FILE", str(log_file))

    r = await client.get("/api/v1/admin/logs/app", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1
    assert r.json()["items"][0]["path"] == "/api/v1/recipes"


async def test_get_ai_logs(client, superuser_token):
    r = await client.get("/api/v1/admin/logs/ai", headers=_auth(superuser_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "next_cursor" in body
    assert "has_more" in body


async def test_get_audit_logs(client, superuser_token):
    # Trigger a real audit event first
    email = unique_email("auditee")
    user = await _register(client, email)
    await client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    r = await client.get("/api/v1/admin/logs/audit", headers=_auth(superuser_token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(i["action"] == "DEACTIVATE" for i in items)
    assert all("description" in i for i in items)
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend && pytest tests/integration/test_admin_routes.py -v 2>&1 | head -40
```
Expected: `404` or `500` errors — routes don't exist yet.

- [ ] **Step 3: Rewrite `admin.py` routes**

```python
# backend/app/api/routes/admin.py
import asyncio
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import current_superuser
from app.models.user import User
from app.schemas.admin import (
    AdminUserResponse,
    AdminUserUpdate,
    AICallLogResponse,
    AppLogsResponse,
    PaginatedAdminUsersResponse,
    PaginatedAICallLogResponse,
    PaginatedAuditLogResponse,
    UserStatsResponse,
)
from app.services import admin as admin_service
from app.tasks.cleanup import cleanup_old_uploads

router = APIRouter()


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=PaginatedAdminUsersResponse)
async def list_users(
    search: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None),
    role: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAdminUsersResponse:
    items, next_cursor, has_more = await admin_service.list_users(
        db, search=search, status=status, role=role, cursor=cursor, limit=limit
    )
    return PaginatedAdminUsersResponse(
        items=[AdminUserResponse.model_validate(u) for u in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> AdminUserResponse:
    user = await admin_service.update_user(
        db, user_id, admin,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return AdminUserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> None:
    if not await admin_service.delete_user(db, user_id, admin):
        raise HTTPException(status_code=404, detail="User not found")


@router.get("/users/{user_id}/stats", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> UserStatsResponse:
    if not await db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return await admin_service.get_user_stats(db, user_id)


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs/app", response_model=AppLogsResponse)
async def get_app_logs(
    level: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(current_superuser),
) -> AppLogsResponse:
    items = await admin_service.get_app_logs(
        level=level, user_id=user_id, limit=limit, log_file=settings.APP_LOG_FILE
    )
    return AppLogsResponse(items=items)


@router.get("/logs/ai", response_model=PaginatedAICallLogResponse)
async def get_ai_logs(
    call_type: str | None = Query(default=None),
    success: bool | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    since: datetime | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAICallLogResponse:
    items, next_cursor, has_more = await admin_service.get_ai_logs(
        db, call_type=call_type, success=success, user_id=user_id,
        since=since, cursor=cursor, limit=limit,
    )
    return PaginatedAICallLogResponse(
        items=[AICallLogResponse.model_validate(i) for i in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/logs/audit", response_model=PaginatedAuditLogResponse)
async def get_audit_logs(
    action: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAuditLogResponse:
    items, next_cursor, has_more = await admin_service.get_audit_logs(
        db, action=action, since=since, cursor=cursor, limit=limit,
    )
    return PaginatedAuditLogResponse(items=items, next_cursor=next_cursor, has_more=has_more)


# ── Cleanup ───────────────────────────────────────────────────────────────────

@router.post("/cleanup")
async def trigger_cleanup(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> dict:
    deleted_count = await asyncio.to_thread(cleanup_old_uploads)
    await admin_service.write_audit_log(
        db, admin_id=admin.id, action="CLEANUP",
        details={"deleted_count": deleted_count},
    )
    await db.commit()
    return {"deleted_count": deleted_count}
```

- [ ] **Step 4: Run integration tests — expect pass**

```bash
cd backend && pytest tests/integration/test_admin_routes.py -v
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/admin.py tests/integration/test_admin_routes.py
git commit -m "feat: admin routes — users CRUD, log endpoints, cleanup audit trail"
```

---

## Task 7: Instrument AI Service

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/services/recipe_import_service.py`
- Modify: `backend/app/services/meal_suggestion_service.py`

- [ ] **Step 1: Add `_write_ai_log` helper and update `import_recipe_from_url`**

Add this import at the top of `ai_service.py`:
```python
import uuid as _uuid
```

Add this helper function before `import_recipe_from_url`:
```python
async def _write_ai_log(
    db,  # AsyncSession | None
    *,
    user_id: "_uuid.UUID | None",
    call_type: str,
    model: str,
    prompt_summary: str,
    latency_ms: int,
    input_tokens: int,
    output_tokens: int,
    success: bool,
    error_message: str | None,
) -> None:
    if db is None:
        return
    from datetime import timezone
    from app.models.admin import AICallLog
    db.add(AICallLog(
        user_id=user_id,
        call_type=call_type,
        model=model,
        prompt_summary=prompt_summary[:200],
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        success=success,
        error_message=error_message,
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
```

Change `import_recipe_from_url` signature to:
```python
async def import_recipe_from_url(
    url: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> RecipeImportResult:
```

In the success branch (after the `logger.info(...)` call), add:
```python
            await _write_ai_log(
                db, user_id=user_id, call_type="url_import", model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return RecipeImportResult.model_validate_json(response.text)
```

After the retry loop's `raise AIServiceError(...)` line, add:
```python
    await _write_ai_log(
        db, user_id=user_id, call_type="url_import", model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(...) from last_error
```

- [ ] **Step 2: Update `import_recipe_from_image` the same way**

Change signature:
```python
async def import_recipe_from_image(
    image_bytes: bytes,
    mime_type: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,
) -> RecipeImportResult:
```

In success branch add:
```python
            await _write_ai_log(
                db, user_id=user_id, call_type="image_import", model=settings.AI_MODEL,
                prompt_summary="[image import]", latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
```

After retry loop add failure log:
```python
    await _write_ai_log(
        db, user_id=user_id, call_type="image_import", model=settings.AI_MODEL,
        prompt_summary="[image import]", latency_ms=0,
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
```

- [ ] **Step 3: Update `call_ai_structured`**

Change signature:
```python
async def call_ai_structured(
    prompt: str,
    response_model: type[_T],
    call_type: str = "unknown",
    user_id: "_uuid.UUID | None" = None,
    db=None,
) -> _T:
```

In success branch add:
```python
            await _write_ai_log(
                db, user_id=user_id, call_type=call_type, model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=0, output_tokens=0,
                success=True, error_message=None,
            )
```

(Token counts are not available in `call_ai_structured` — log 0 for now. Fix in a future pass if needed.)

After retry loop add failure log:
```python
    await _write_ai_log(
        db, user_id=user_id, call_type=call_type, model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=0,
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
```

- [ ] **Step 4: Update `recipe_import_service.py` — pass `db` and `user_id`**

In `process_url_import`, change:
```python
            result: RecipeImportResult = await ai_service.import_recipe_from_url(url)
```
to:
```python
            result: RecipeImportResult = await ai_service.import_recipe_from_url(
                url, user_id=user_id, db=db
            )
```

In `process_image_import` (wherever `import_recipe_from_image` is called), apply the same change:
```python
            result = await ai_service.import_recipe_from_image(
                image_bytes, mime_type, user_id=user_id, db=db
            )
```

- [ ] **Step 5: Update `meal_suggestion_service.py` — pass `call_type` and `user_id`**

In `process_suggestions_task`, find the `generate_meal_suggestions` call (or the `call_ai_structured` call it wraps). Update `generate_meal_suggestions` to accept and forward `user_id` and `db`:

In `ai_service.py`, update `generate_meal_suggestions` signature:
```python
async def generate_meal_suggestions(
    ...,  # existing params unchanged
    user_id: "_uuid.UUID | None" = None,
    db=None,
) -> MealSuggestionResult:
```

Change the `call_ai_structured` call inside it to:
```python
    result = await call_ai_structured(
        full_prompt, MealSuggestionResult,
        call_type="meal_plan", user_id=user_id, db=db,
    )
```

In `meal_suggestion_service.py`, update the `generate_meal_suggestions` call to pass `user_id=user_id, db=db`.

- [ ] **Step 6: Run the full test suite**

```bash
cd backend && pytest --cov=app --cov-report=term-missing -q
```
Expected: all tests pass. Any new failures indicate a signature mismatch — fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add app/services/ai_service.py app/services/recipe_import_service.py app/services/meal_suggestion_service.py
git commit -m "feat: instrument AI service — write AICallLog after every Gemini call"
```

---

## Task 8: Frontend Types + API Client

**Files:**
- Create: `frontend/src/types/admin.ts`
- Create: `frontend/src/api/admin.ts`

- [ ] **Step 1: Write types**

```typescript
// frontend/src/types/admin.ts

export interface AdminUser {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
  preferred_units: 'metric' | 'imperial'
  created_at: string
  updated_at: string
}

export interface UserStats {
  recipe_count: number
  meal_plan_count: number
  last_active: string | null
}

export interface PaginatedAdminUsersResponse {
  items: AdminUser[]
  next_cursor: string | null
  has_more: boolean
}

export interface AICallLog {
  id: string
  user_id: string | null
  call_type: string
  model: string
  prompt_summary: string
  latency_ms: number
  input_tokens: number
  output_tokens: number
  success: boolean
  error_message: string | null
  created_at: string
}

export interface PaginatedAICallLogResponse {
  items: AICallLog[]
  next_cursor: string | null
  has_more: boolean
}

export type AuditAction = 'PROMOTE' | 'DEMOTE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'CLEANUP'

export interface AdminAuditLog {
  id: string
  admin_id: string
  admin_email: string
  action: AuditAction
  target_user_id: string | null
  target_email: string | null
  details: Record<string, unknown>
  description: string
  created_at: string
}

export interface PaginatedAuditLogResponse {
  items: AdminAuditLog[]
  next_cursor: string | null
  has_more: boolean
}

export interface AppLogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  method: string
  path: string
  status_code: number
  latency_ms: number
  user_id: string | null
}

export interface AppLogsResponse {
  items: AppLogEntry[]
}

export interface AdminUserUpdate {
  is_active?: boolean
  is_superuser?: boolean
}
```

- [ ] **Step 2: Write API client**

```typescript
// frontend/src/api/admin.ts
import client from './client'
import type {
  AdminUser,
  AdminUserUpdate,
  AppLogsResponse,
  PaginatedAdminUsersResponse,
  PaginatedAICallLogResponse,
  PaginatedAuditLogResponse,
  UserStats,
} from '@/types/admin'

export const listUsers = (params?: {
  search?: string
  status?: 'active' | 'inactive'
  role?: 'user' | 'superuser'
  cursor?: string
  limit?: number
}) => client.get<PaginatedAdminUsersResponse>('/admin/users', { params })

export const updateUser = (id: string, data: AdminUserUpdate) =>
  client.patch<AdminUser>(`/admin/users/${id}`, data)

export const deleteUser = (id: string) => client.delete(`/admin/users/${id}`)

export const getUserStats = (id: string) =>
  client.get<UserStats>(`/admin/users/${id}/stats`)

export const getAppLogs = (params?: {
  level?: string
  user_id?: string
  limit?: number
}) => client.get<AppLogsResponse>('/admin/logs/app', { params })

export const getAiLogs = (params?: {
  call_type?: string
  success?: boolean
  user_id?: string
  since?: string
  cursor?: string
  limit?: number
}) => client.get<PaginatedAICallLogResponse>('/admin/logs/ai', { params })

export const getAuditLogs = (params?: {
  action?: string
  since?: string
  cursor?: string
  limit?: number
}) => client.get<PaginatedAuditLogResponse>('/admin/logs/audit', { params })

export const triggerCleanup = () =>
  client.post<{ deleted_count: number }>('/admin/cleanup')
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/types/admin.ts src/api/admin.ts
git commit -m "feat: add admin TypeScript types and API client"
```

---

## Task 9: Frontend Stores

**Files:**
- Create: `frontend/src/stores/useAdminUsersStore.ts`
- Create: `frontend/src/stores/useAdminUsersStore.test.ts`
- Create: `frontend/src/stores/useAdminLogsStore.ts`
- Create: `frontend/src/stores/useAdminLogsStore.test.ts`

- [ ] **Step 1: Write failing store tests**

```typescript
// frontend/src/stores/useAdminUsersStore.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '@/api/admin'
import type { AdminUser } from '@/types/admin'

vi.mock('@/api/admin')

const mockUser = (overrides?: Partial<AdminUser>): AdminUser => ({
  id: '1', email: 'a@b.com', display_name: null,
  is_active: true, is_superuser: false, is_verified: true,
  preferred_units: 'metric', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useAdminUsersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchUsers populates users and pagination state', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.listUsers).mockResolvedValue({
      data: { items: [mockUser()], next_cursor: null, has_more: false },
    } as any)

    const store = useAdminUsersStore()
    await store.fetchUsers()

    expect(store.users).toHaveLength(1)
    expect(store.hasMore).toBe(false)
    expect(store.nextCursor).toBeNull()
  })

  it('expandUser sets expandedUserId and loads stats', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.getUserStats).mockResolvedValue({
      data: { recipe_count: 3, meal_plan_count: 1, last_active: null },
    } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1' })]
    await store.expandUser('u1')

    expect(store.expandedUserId).toBe('u1')
    expect(store.userStats['u1']?.recipe_count).toBe(3)
  })

  it('expandUser collapses when called with already-expanded id', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    const store = useAdminUsersStore()
    store.expandedUserId = 'u1'
    await store.expandUser('u1')
    expect(store.expandedUserId).toBeNull()
  })

  it('updateUser patches user via API and updates local list', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    const updated = mockUser({ id: 'u1', is_active: false })
    vi.mocked(adminApi.updateUser).mockResolvedValue({ data: updated } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1', is_active: true })]
    await store.updateUser('u1', { is_active: false })

    expect(store.users[0].is_active).toBe(false)
  })

  it('deleteUser removes user from local list', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ data: undefined } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1' }), mockUser({ id: 'u2' })]
    await store.deleteUser('u1')

    expect(store.users).toHaveLength(1)
    expect(store.users[0].id).toBe('u2')
  })
})
```

```typescript
// frontend/src/stores/useAdminLogsStore.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '@/api/admin'

vi.mock('@/api/admin')

describe('useAdminLogsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchAppLogs populates appLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAppLogs).mockResolvedValue({
      data: { items: [{ timestamp: 't', level: 'INFO', method: 'GET', path: '/x', status_code: 200, latency_ms: 1, user_id: null }] },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAppLogs()
    expect(store.appLogs).toHaveLength(1)
  })

  it('fetchAiLogs populates aiLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAiLogs).mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAiLogs()
    expect(store.aiLogs).toEqual([])
    expect(store.aiLogsHasMore).toBe(false)
  })

  it('fetchAuditLogs populates auditLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAuditLogs).mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAuditLogs()
    expect(store.auditLogs).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npx vitest run src/stores/useAdminUsersStore.test.ts src/stores/useAdminLogsStore.test.ts 2>&1 | tail -10
```
Expected: import errors — stores don't exist yet.

- [ ] **Step 3: Implement the stores**

```typescript
// frontend/src/stores/useAdminUsersStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '@/api/admin'
import type { AdminUser, AdminUserUpdate, UserStats } from '@/types/admin'

export const useAdminUsersStore = defineStore('adminUsers', () => {
  const users = ref<AdminUser[]>([])
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const loading = ref(false)
  const expandedUserId = ref<string | null>(null)
  const userStats = ref<Record<string, UserStats>>({})
  const statsLoading = ref<Record<string, boolean>>({})

  async function fetchUsers(params?: {
    search?: string
    status?: 'active' | 'inactive'
    role?: 'user' | 'superuser'
  }) {
    loading.value = true
    try {
      const { data } = await adminApi.listUsers({ ...params, limit: 20 })
      users.value = data.items
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || !nextCursor.value) return
    loading.value = true
    try {
      const { data } = await adminApi.listUsers({ cursor: nextCursor.value, limit: 20 })
      users.value.push(...data.items)
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function expandUser(userId: string) {
    if (expandedUserId.value === userId) {
      expandedUserId.value = null
      return
    }
    expandedUserId.value = userId
    if (!userStats.value[userId]) {
      statsLoading.value[userId] = true
      try {
        const { data } = await adminApi.getUserStats(userId)
        userStats.value[userId] = data
      } finally {
        statsLoading.value[userId] = false
      }
    }
  }

  async function updateUser(userId: string, data: AdminUserUpdate) {
    const { data: updated } = await adminApi.updateUser(userId, data)
    const idx = users.value.findIndex((u) => u.id === userId)
    if (idx !== -1) users.value[idx] = updated
  }

  async function deleteUser(userId: string) {
    await adminApi.deleteUser(userId)
    users.value = users.value.filter((u) => u.id !== userId)
    if (expandedUserId.value === userId) expandedUserId.value = null
  }

  return {
    users, nextCursor, hasMore, loading,
    expandedUserId, userStats, statsLoading,
    fetchUsers, loadMore, expandUser, updateUser, deleteUser,
  }
})
```

```typescript
// frontend/src/stores/useAdminLogsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '@/api/admin'
import type { AICallLog, AdminAuditLog, AppLogEntry } from '@/types/admin'

export const useAdminLogsStore = defineStore('adminLogs', () => {
  const appLogs = ref<AppLogEntry[]>([])
  const aiLogs = ref<AICallLog[]>([])
  const auditLogs = ref<AdminAuditLog[]>([])
  const aiLogsNextCursor = ref<string | null>(null)
  const aiLogsHasMore = ref(false)
  const auditLogsNextCursor = ref<string | null>(null)
  const auditLogsHasMore = ref(false)
  const loading = ref(false)

  async function fetchAppLogs(params?: { level?: string; user_id?: string; limit?: number }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAppLogs(params)
      appLogs.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function fetchAiLogs(params?: {
    call_type?: string; success?: boolean; user_id?: string; since?: string
  }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAiLogs({ ...params, limit: 20 })
      aiLogs.value = data.items
      aiLogsNextCursor.value = data.next_cursor
      aiLogsHasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMoreAiLogs() {
    if (!aiLogsHasMore.value || !aiLogsNextCursor.value) return
    const { data } = await adminApi.getAiLogs({ cursor: aiLogsNextCursor.value, limit: 20 })
    aiLogs.value.push(...data.items)
    aiLogsNextCursor.value = data.next_cursor
    aiLogsHasMore.value = data.has_more
  }

  async function fetchAuditLogs(params?: { action?: string; since?: string }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAuditLogs({ ...params, limit: 20 })
      auditLogs.value = data.items
      auditLogsNextCursor.value = data.next_cursor
      auditLogsHasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMoreAuditLogs() {
    if (!auditLogsHasMore.value || !auditLogsNextCursor.value) return
    const { data } = await adminApi.getAuditLogs({ cursor: auditLogsNextCursor.value, limit: 20 })
    auditLogs.value.push(...data.items)
    auditLogsNextCursor.value = data.next_cursor
    auditLogsHasMore.value = data.has_more
  }

  return {
    appLogs, aiLogs, auditLogs,
    aiLogsNextCursor, aiLogsHasMore,
    auditLogsNextCursor, auditLogsHasMore,
    loading,
    fetchAppLogs, fetchAiLogs, loadMoreAiLogs,
    fetchAuditLogs, loadMoreAuditLogs,
  }
})
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && npx vitest run src/stores/useAdminUsersStore.test.ts src/stores/useAdminLogsStore.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/useAdminUsersStore.ts src/stores/useAdminUsersStore.test.ts \
        src/stores/useAdminLogsStore.ts src/stores/useAdminLogsStore.test.ts
git commit -m "feat: admin Pinia stores with tests"
```

---

## Task 10: Router + AdminLayout

**Files:**
- Modify: `frontend/src/router/index.ts`
- Create: `frontend/src/components/admin/AdminLayout.vue`

- [ ] **Step 1: Add admin routes to the router**

In `frontend/src/router/index.ts`, replace the existing `/admin` route:

```typescript
    {
      path: '/admin',
      component: () => import('@/components/admin/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresSuperuser: true },
      redirect: '/admin/users',
      children: [
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/admin/AdminUsersView.vue'),
        },
        {
          path: 'logs/app',
          name: 'admin-logs-app',
          component: () => import('@/views/admin/AdminAppLogsView.vue'),
        },
        {
          path: 'logs/ai',
          name: 'admin-logs-ai',
          component: () => import('@/views/admin/AdminAiLogsView.vue'),
        },
        {
          path: 'logs/audit',
          name: 'admin-logs-audit',
          component: () => import('@/views/admin/AdminAuditLogView.vue'),
        },
      ],
    },
```

- [ ] **Step 2: Write AdminLayout**

```vue
<!-- frontend/src/components/admin/AdminLayout.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import * as adminApi from '@/api/admin'

const route = useRoute()
const cleanupStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const cleanupMessage = ref('')

async function runCleanup() {
  cleanupStatus.value = 'loading'
  try {
    const { data } = await adminApi.triggerCleanup()
    cleanupMessage.value = `Deleted ${data.deleted_count} files`
    cleanupStatus.value = 'done'
  } catch {
    cleanupMessage.value = 'Cleanup failed'
    cleanupStatus.value = 'error'
  } finally {
    setTimeout(() => {
      cleanupStatus.value = 'idle'
      cleanupMessage.value = ''
    }, 3000)
  }
}

const navItems = [
  { name: 'admin-users',     label: '👥 Users',     to: '/admin/users' },
  { name: 'admin-logs-app',  label: '📋 App Logs',  to: '/admin/logs/app' },
  { name: 'admin-logs-ai',   label: '🤖 AI Logs',   to: '/admin/logs/ai' },
  { name: 'admin-logs-audit',label: '🔍 Audit Log', to: '/admin/logs/audit' },
]
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-header">⚙ Admin</div>
      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.name === item.name }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <button
          class="cleanup-btn"
          :disabled="cleanupStatus === 'loading'"
          @click="runCleanup"
        >
          <span v-if="cleanupStatus === 'loading'">Running…</span>
          <span v-else-if="cleanupStatus === 'done' || cleanupStatus === 'error'">{{ cleanupMessage }}</span>
          <span v-else>🗑 Run Cleanup</span>
        </button>
      </div>
    </aside>
    <main class="admin-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #111827;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-header {
  padding: 16px;
  color: #a78bfa;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid #1f2937;
}

.nav-item {
  display: block;
  padding: 10px 16px;
  color: #6b7280;
  text-decoration: none;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: color 0.15s;
}

.nav-item.active,
.nav-item:hover {
  color: #e5e7eb;
}

.nav-item.active {
  background: #1f2937;
  border-left-color: #a78bfa;
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid #1f2937;
}

.cleanup-btn {
  width: 100%;
  background: #1f2937;
  color: #9ca3af;
  border: none;
  border-radius: 4px;
  padding: 7px 8px;
  font-size: 12px;
  cursor: pointer;
  text-align: center;
}

.cleanup-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-main {
  flex: 1;
  background: #0f172a;
  color: #e5e7eb;
  overflow: auto;
  padding: 20px;
}

@media (max-width: 767px) {
  .admin-layout {
    flex-direction: column;
  }
  .admin-sidebar {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sidebar-header { display: none; }
  .nav-item { padding: 8px 12px; font-size: 12px; }
  .sidebar-footer { display: none; }
}
</style>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts src/components/admin/AdminLayout.vue
git commit -m "feat: admin router layout with sidebar navigation"
```

---

## Task 11: AdminUserRow + Shared Components

**Files:**
- Create: `frontend/src/components/admin/AdminUserRow.vue`
- Create: `frontend/src/components/admin/AdminUserPicker.vue`
- Create: `frontend/src/components/admin/LogFilterBar.vue`

- [ ] **Step 1: Write AdminUserRow**

```vue
<!-- frontend/src/components/admin/AdminUserRow.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUser, AdminUserUpdate, UserStats } from '@/types/admin'

const props = defineProps<{
  user: AdminUser
  isExpanded: boolean
  stats: UserStats | null
  statsLoading: boolean
}>()

const emit = defineEmits<{
  toggle: []
  update: [userId: string, data: AdminUserUpdate]
  delete: [userId: string]
}>()

const deleteState = ref<'idle' | 'confirm' | 'countdown'>('idle')
const countdown = ref(5)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startDeleteCountdown() {
  deleteState.value = 'countdown'
  countdown.value = 5
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!)
      deleteState.value = 'confirm'
    }
  }, 1000)
}

function cancelDelete() {
  if (countdownTimer) clearInterval(countdownTimer)
  deleteState.value = 'idle'
  countdown.value = 5
}

function confirmDelete() {
  emit('delete', props.user.id)
  deleteState.value = 'idle'
}

// Reset delete state when row collapses
watch(() => props.isExpanded, (v) => {
  if (!v) cancelDelete()
})

const joinedDate = computed(() =>
  new Date(props.user.created_at).toISOString().slice(0, 10)
)
</script>

<template>
  <div class="user-row-wrapper">
    <div class="user-row" :class="{ inactive: !user.is_active }">
      <div class="col-email">
        <div>{{ user.email }}</div>
        <div v-if="user.display_name" class="display-name">{{ user.display_name }}</div>
      </div>
      <div class="col-status">
        <span :class="user.is_active ? 'badge-active' : 'badge-inactive'">
          {{ user.is_active ? '● Active' : '○ Inactive' }}
        </span>
      </div>
      <div class="col-role">
        <span :class="user.is_superuser ? 'badge-super' : 'badge-user'">
          {{ user.is_superuser ? 'Superuser' : 'User' }}
        </span>
      </div>
      <div class="col-joined">{{ joinedDate }}</div>
      <div class="col-expand">
        <button class="expand-btn" @click="emit('toggle')">
          {{ isExpanded ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <div v-if="isExpanded" class="expanded-panel">
      <div v-if="statsLoading" class="stats-loading">Loading…</div>
      <div v-else-if="stats" class="stats">
        <span>Recipes: {{ stats.recipe_count }}</span>
        <span>Meal plans: {{ stats.meal_plan_count }}</span>
        <span v-if="stats.last_active">Last active: {{ stats.last_active.slice(0, 10) }}</span>
        <span v-else>Never active</span>
      </div>
      <div class="actions">
        <button
          class="btn-action btn-role"
          @click="emit('update', user.id, { is_superuser: !user.is_superuser })"
        >
          {{ user.is_superuser ? 'Demote from superuser' : 'Promote to superuser' }}
        </button>
        <button
          class="btn-action btn-status"
          @click="emit('update', user.id, { is_active: !user.is_active })"
        >
          {{ user.is_active ? 'Deactivate' : 'Activate' }}
        </button>
        <button
          v-if="deleteState === 'idle'"
          class="btn-action btn-delete"
          @click="startDeleteCountdown"
        >
          Delete account…
        </button>
        <button
          v-else-if="deleteState === 'countdown'"
          class="btn-action btn-delete btn-disabled"
          disabled
        >
          Confirm delete? ({{ countdown }})
        </button>
        <button
          v-else
          class="btn-action btn-delete btn-confirm"
          @click="confirmDelete"
        >
          Confirm delete
        </button>
        <button v-if="deleteState !== 'idle'" class="btn-action btn-cancel" @click="cancelDelete">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 100px 50px;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #1e293b;
  align-items: center;
  font-size: 13px;
}
.user-row.inactive { opacity: 0.55; }
.display-name { font-size: 11px; color: #6b7280; }
.badge-active  { color: #4ade80; }
.badge-inactive { color: #f87171; }
.badge-super   { color: #f59e0b; }
.badge-user    { color: #6b7280; }
.col-joined    { color: #6b7280; font-size: 12px; }
.expand-btn    { background: none; border: none; color: #60a5fa; cursor: pointer; font-size: 13px; }
.expanded-panel {
  background: #0c1a2e;
  border-left: 3px solid #a78bfa;
  padding: 12px 16px;
  font-size: 12px;
}
.stats { display: flex; gap: 16px; color: #94a3b8; margin-bottom: 10px; flex-wrap: wrap; }
.stats-loading { color: #6b7280; margin-bottom: 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-action {
  border: none; border-radius: 4px; padding: 5px 10px; font-size: 11px;
  cursor: pointer; font-family: inherit;
}
.btn-role    { background: #1d4ed8; color: #fff; }
.btn-status  { background: #92400e; color: #fff; }
.btn-delete  { background: #7f1d1d; color: #fff; }
.btn-confirm { background: #dc2626; color: #fff; }
.btn-cancel  { background: #374151; color: #e5e7eb; }
.btn-disabled { opacity: 0.6; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: Write AdminUserPicker**

```vue
<!-- frontend/src/components/admin/AdminUserPicker.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import * as adminApi from '@/api/admin'
import type { AdminUser } from '@/types/admin'

const model = defineModel<string | null>({ default: null })

const query = ref('')
const results = ref<AdminUser[]>([])
const selectedEmail = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!val.trim()) { results.value = []; return }
  debounceTimer = setTimeout(async () => {
    const { data } = await adminApi.listUsers({ search: val, limit: 10 })
    results.value = data.items
  }, 250)
})

function select(user: AdminUser) {
  model.value = user.id
  selectedEmail.value = user.email
  query.value = ''
  results.value = []
}

function clear() {
  model.value = null
  selectedEmail.value = null
}
</script>

<template>
  <div class="user-picker">
    <div v-if="selectedEmail" class="selected-chip">
      👤 {{ selectedEmail }}
      <button class="clear-btn" @click="clear">✕</button>
    </div>
    <div v-else class="search-wrapper">
      <input
        v-model="query"
        class="search-input"
        placeholder="Filter by user email…"
      />
      <ul v-if="results.length" class="dropdown">
        <li
          v-for="u in results"
          :key="u.id"
          class="dropdown-item"
          @click="select(u)"
        >
          {{ u.email }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.user-picker { position: relative; }
.selected-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: #1a2744; border: 1px solid #a78bfa;
  color: #a78bfa; border-radius: 4px; padding: 4px 8px; font-size: 12px;
}
.clear-btn { background: none; border: none; color: #a78bfa; cursor: pointer; font-size: 12px; }
.search-input {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #e5e7eb; font-size: 12px; width: 220px;
}
.dropdown {
  position: absolute; top: 100%; left: 0; width: 100%; background: #1f2937;
  border: 1px solid #374151; border-radius: 4px; list-style: none; margin: 2px 0; padding: 0;
  z-index: 10;
}
.dropdown-item {
  padding: 7px 10px; font-size: 12px; color: #e5e7eb; cursor: pointer;
}
.dropdown-item:hover { background: #374151; }
</style>
```

- [ ] **Step 3: Write LogFilterBar**

```vue
<!-- frontend/src/components/admin/LogFilterBar.vue -->
<script setup lang="ts">
defineProps<{ loading?: boolean }>()
defineEmits<{ refresh: [] }>()
</script>

<template>
  <div class="filter-bar">
    <slot />
    <button class="refresh-btn" :disabled="loading" @click="$emit('refresh')">
      ⟳ Refresh
    </button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;
}
.refresh-btn {
  margin-left: auto; background: #1f2937; border: 1px solid #374151;
  border-radius: 4px; padding: 5px 10px; color: #9ca3af; font-size: 12px; cursor: pointer;
}
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/
git commit -m "feat: AdminUserRow, AdminUserPicker, LogFilterBar components"
```

---

## Task 12: Admin Views

**Files:**
- Create: `frontend/src/views/admin/AdminUsersView.vue`
- Create: `frontend/src/views/admin/AdminAppLogsView.vue`
- Create: `frontend/src/views/admin/AdminAiLogsView.vue`
- Create: `frontend/src/views/admin/AdminAuditLogView.vue`

- [ ] **Step 1: Write AdminUsersView**

```vue
<!-- frontend/src/views/admin/AdminUsersView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserRow from '@/components/admin/AdminUserRow.vue'
import { useAdminUsersStore } from '@/stores/useAdminUsersStore'

const store = useAdminUsersStore()
const search = ref('')
const statusFilter = ref<'active' | 'inactive' | ''>('')
const roleFilter = ref<'user' | 'superuser' | ''>('')

onMounted(() => fetchUsers())

async function fetchUsers() {
  await store.fetchUsers({
    search: search.value || undefined,
    status: (statusFilter.value || undefined) as 'active' | 'inactive' | undefined,
    role: (roleFilter.value || undefined) as 'user' | 'superuser' | undefined,
  })
}
</script>

<template>
  <div>
    <div class="toolbar">
      <input v-model="search" class="search-input" placeholder="Search by email or name…" @keydown.enter="fetchUsers" />
      <select v-model="statusFilter" class="filter-select" @change="fetchUsers">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <select v-model="roleFilter" class="filter-select" @change="fetchUsers">
        <option value="">All roles</option>
        <option value="user">User</option>
        <option value="superuser">Superuser</option>
      </select>
      <button class="search-btn" @click="fetchUsers">Search</button>
    </div>

    <div class="table-header">
      <span>Email / Name</span>
      <span>Status</span>
      <span>Role</span>
      <span>Joined</span>
      <span></span>
    </div>

    <div v-if="store.loading && !store.users.length" class="loading">Loading…</div>

    <AdminUserRow
      v-for="user in store.users"
      :key="user.id"
      :user="user"
      :is-expanded="store.expandedUserId === user.id"
      :stats="store.userStats[user.id] ?? null"
      :stats-loading="!!store.statsLoading[user.id]"
      @toggle="store.expandUser(user.id)"
      @update="(id, data) => store.updateUser(id, data)"
      @delete="store.deleteUser"
    />

    <div class="pagination">
      <span class="count">{{ store.users.length }} user{{ store.users.length !== 1 ? 's' : '' }} loaded</span>
      <button v-if="store.hasMore" class="load-more" :disabled="store.loading" @click="store.loadMore">
        Load more
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search-input {
  flex: 1; min-width: 180px; background: #1f2937; border: 1px solid #374151;
  border-radius: 4px; padding: 6px 10px; color: #e5e7eb; font-size: 13px;
}
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 6px 8px; color: #9ca3af; font-size: 12px;
}
.search-btn {
  background: #1d4ed8; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.table-header {
  display: grid; grid-template-columns: 2fr 1fr 1fr 100px 50px;
  gap: 8px; padding: 5px 12px; background: #1e3a5f;
  border-radius: 4px 4px 0 0; font-size: 11px; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.loading { padding: 20px; color: #6b7280; text-align: center; }
.pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.count { font-size: 12px; color: #6b7280; }
.load-more {
  background: #1f2937; color: #60a5fa; border: 1px solid #374151;
  border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
</style>
```

- [ ] **Step 2: Write AdminAppLogsView**

```vue
<!-- frontend/src/views/admin/AdminAppLogsView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserPicker from '@/components/admin/AdminUserPicker.vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'

const store = useAdminLogsStore()
const levelFilter = ref('')
const userIdFilter = ref<string | null>(null)
const limitFilter = ref(100)

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAppLogs({
    level: levelFilter.value || undefined,
    user_id: userIdFilter.value || undefined,
    limit: limitFilter.value,
  })
}

function levelClass(level: string) {
  return { 'level-info': level === 'INFO', 'level-warn': level === 'WARN', 'level-error': level === 'ERROR' }
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="levelFilter" class="filter-select" @change="fetchLogs">
        <option value="">All levels</option>
        <option>INFO</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select>
      <select v-model="limitFilter" class="filter-select" @change="fetchLogs">
        <option :value="50">Last 50</option>
        <option :value="100">Last 100</option>
        <option :value="500">Last 500</option>
      </select>
      <AdminUserPicker v-model="userIdFilter" @update:model-value="fetchLogs" />
    </LogFilterBar>

    <div class="log-table-header">
      <span>Time</span><span>Level</span><span>Path</span><span>Status</span><span>Latency</span>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="!store.appLogs.length" class="empty">No log entries found.</div>

    <div v-for="entry in store.appLogs" :key="entry.timestamp + entry.path" class="log-row">
      <span class="ts">{{ entry.timestamp.slice(11, 19) }}</span>
      <span class="level-badge" :class="levelClass(entry.level)">{{ entry.level }}</span>
      <span class="path">{{ entry.method }} {{ entry.path }}</span>
      <span>{{ entry.status_code }}</span>
      <span>{{ entry.latency_ms }}ms</span>
    </div>

    <div class="footnote">Structured JSON request log · read-only</div>
  </div>
</template>

<style scoped>
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #9ca3af; font-size: 12px;
}
.log-table-header {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 4px 10px; background: #1e293b; font-size: 11px;
  color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
}
.log-row {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 5px 10px; border-bottom: 1px solid #1e293b; font-size: 12px;
}
.ts { color: #4b5563; }
.level-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.level-info  { color: #4ade80; background: #052e16; }
.level-warn  { color: #fbbf24; background: #451a03; }
.level-error { color: #f87171; background: #450a0a; }
.path { color: #d1d5db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loading, .empty { padding: 20px; color: #6b7280; text-align: center; }
.footnote { font-size: 11px; color: #4b5563; margin-top: 8px; }
</style>
```

- [ ] **Step 3: Write AdminAiLogsView**

```vue
<!-- frontend/src/views/admin/AdminAiLogsView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserPicker from '@/components/admin/AdminUserPicker.vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'

const store = useAdminLogsStore()
const callTypeFilter = ref('')
const successFilter = ref<'all' | 'true' | 'false'>('all')
const userIdFilter = ref<string | null>(null)
const sinceFilter = ref('')

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAiLogs({
    call_type: callTypeFilter.value || undefined,
    success: successFilter.value === 'all' ? undefined : successFilter.value === 'true',
    user_id: userIdFilter.value || undefined,
    since: sinceFilter.value || undefined,
  })
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="callTypeFilter" class="filter-select" @change="fetchLogs">
        <option value="">All types</option>
        <option value="url_import">url-import</option>
        <option value="image_import">image-import</option>
        <option value="meal_plan">meal-plan</option>
      </select>
      <select v-model="successFilter" class="filter-select" @change="fetchLogs">
        <option value="all">All statuses</option>
        <option value="true">Success</option>
        <option value="false">Failed</option>
      </select>
      <AdminUserPicker v-model="userIdFilter" @update:model-value="fetchLogs" />
    </LogFilterBar>

    <div class="table-header">
      <span>Time</span><span>Type</span><span>Model</span>
      <span>In tok</span><span>Out tok</span><span>Latency</span>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="!store.aiLogs.length" class="empty">No AI log entries found.</div>

    <div v-for="entry in store.aiLogs" :key="entry.id" class="log-row">
      <span class="ts">{{ entry.created_at.slice(11, 19) }}</span>
      <span class="call-type">{{ entry.call_type }}</span>
      <span class="model">{{ entry.model.slice(0, 12) }}</span>
      <span>{{ entry.input_tokens.toLocaleString() }}</span>
      <span>{{ entry.output_tokens.toLocaleString() }}</span>
      <span :class="entry.success ? 'latency-ok' : 'latency-err'">
        {{ entry.success ? `${(entry.latency_ms / 1000).toFixed(1)}s` : entry.error_message || 'failed' }}
      </span>
    </div>

    <button v-if="store.aiLogsHasMore" class="load-more" :disabled="store.loading" @click="store.loadMoreAiLogs">
      Load more
    </button>
  </div>
</template>

<style scoped>
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #9ca3af; font-size: 12px;
}
.table-header {
  display: grid; grid-template-columns: 80px 100px 100px 70px 70px 80px;
  gap: 8px; padding: 4px 10px; background: #1e293b; font-size: 11px;
  color: #64748b; text-transform: uppercase;
}
.log-row {
  display: grid; grid-template-columns: 80px 100px 100px 70px 70px 80px;
  gap: 8px; padding: 5px 10px; border-bottom: 1px solid #1e293b; font-size: 12px; align-items: center;
}
.ts { color: #4b5563; }
.call-type { color: #a78bfa; }
.model { color: #94a3b8; font-size: 11px; }
.latency-ok  { color: #4ade80; }
.latency-err { color: #f87171; }
.loading, .empty { padding: 20px; color: #6b7280; text-align: center; }
.load-more {
  margin-top: 10px; background: #1f2937; color: #60a5fa; border: 1px solid #374151;
  border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer;
}
</style>
```

- [ ] **Step 4: Write AdminAuditLogView**

```vue
<!-- frontend/src/views/admin/AdminAuditLogView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'
import type { AuditAction } from '@/types/admin'

const store = useAdminLogsStore()
const actionFilter = ref<AuditAction | ''>('')
const sinceFilter = ref('')

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAuditLogs({
    action: actionFilter.value || undefined,
    since: sinceFilter.value || undefined,
  })
}

const badgeClass: Record<AuditAction, string> = {
  PROMOTE:    'badge-blue',
  DEMOTE:     'badge-blue',
  ACTIVATE:   'badge-green',
  DEACTIVATE: 'badge-amber',
  DELETE:     'badge-red',
  CLEANUP:    'badge-grey',
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="actionFilter" class="filter-select" @change="fetchLogs">
        <option value="">All actions</option>
        <option>PROMOTE</option>
        <option>DEMOTE</option>
        <option>ACTIVATE</option>
        <option>DEACTIVATE</option>
        <option>DELETE</option>
        <option>CLEANUP</option>
      </select>
    </LogFilterBar>

    <div class="table-header">
      <span>Time</span><span>Action</span><span>Description</span><span>By</span>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="!store.auditLogs.length" class="empty">No audit log entries found.</div>

    <div v-for="entry in store.auditLogs" :key="entry.id" class="log-row">
      <span class="ts">{{ entry.created_at.slice(0, 10) }}</span>
      <span class="badge" :class="badgeClass[entry.action]">{{ entry.action }}</span>
      <span class="description">{{ entry.description }}</span>
      <span class="by">{{ entry.admin_email }}</span>
    </div>

    <button v-if="store.auditLogsHasMore" class="load-more" @click="store.loadMoreAuditLogs">
      Load more
    </button>
  </div>
</template>

<style scoped>
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #9ca3af; font-size: 12px;
}
.table-header {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 4px 10px; background: #1e293b; font-size: 11px;
  color: #64748b; text-transform: uppercase;
}
.log-row {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 6px 10px; border-bottom: 1px solid #1e293b; font-size: 12px; align-items: center;
}
.ts { color: #4b5563; }
.badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
.badge-blue  { color: #93c5fd; background: #172554; }
.badge-green { color: #4ade80; background: #052e16; }
.badge-amber { color: #fbbf24; background: #451a03; }
.badge-red   { color: #f87171; background: #450a0a; }
.badge-grey  { color: #9ca3af; background: #1f2937; }
.description { color: #d1d5db; }
.by { color: #a78bfa; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.loading, .empty { padding: 20px; color: #6b7280; text-align: center; }
.load-more {
  margin-top: 10px; background: #1f2937; color: #60a5fa; border: 1px solid #374151;
  border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer;
}
</style>
```

- [ ] **Step 5: Create view directories if needed**

```bash
cd frontend && mkdir -p src/views/admin
```

- [ ] **Step 6: Type-check the entire frontend**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 7: Run unit tests**

```bash
cd frontend && npm run test:unit
```
Expected: all tests pass (including the store tests from Task 9).

- [ ] **Step 8: Commit**

```bash
git add src/views/admin/
git commit -m "feat: admin views — users table, app logs, AI logs, audit log"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && pytest --cov=app --cov-report=term-missing -q
```
Expected: all tests pass, coverage ≥ 80% on `app/services/admin.py` and `app/api/routes/admin.py`.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npm run test:unit
```
Expected: all tests pass.

- [ ] **Step 3: Run lint and type-check**

```bash
cd backend && ruff check app/ && mypy app/ --ignore-missing-imports
cd frontend && npm run lint && npm run type-check
```
Expected: no errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: admin dashboard — complete implementation

Adds user management (list/search/activate/deactivate/promote/demote/delete),
structured JSON request logging middleware, AI call log persistence,
append-only admin audit trail, and log viewer UI.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Sidebar navigation with 4 sections + cleanup button
- ✅ User table with search, status/role filters, cursor pagination
- ✅ Expandable row with lazy stats load, action buttons
- ✅ Delete countdown confirmation
- ✅ App logs from structured JSON file, filtered by level + user
- ✅ AI call logs in DB, filtered by type/status/user/date
- ✅ Audit log in DB, append-only, action filter
- ✅ Cleanup button writes audit entry
- ✅ `APP_LOG_FILE` env var

**Type consistency across tasks:**
- `write_audit_log` (public, no underscore) used in Tasks 5, 6, and route Task 6
- `get_app_logs` takes `log_file: str` (not `settings.APP_LOG_FILE` directly) so it's testable with monkeypatch
- Cursor format `{iso}|{id}` consistent across `list_users`, `get_ai_logs`, `get_audit_logs`
- `AdminUserUpdate` has `is_active` and `is_superuser` (both optional) — matches route PATCH handler
- `PaginatedAdminUsersResponse` in both schema and frontend type
