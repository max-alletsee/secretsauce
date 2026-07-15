# AI Call Budget (Onboarding Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users get a 300-AI-call budget enforced at every AI-triggering route; admins can remove/restore the budget per user and see usage; capped users see an "onboarding mode" message.

**Architecture:** A nullable `users.ai_call_budget` column (NULL = unlimited) plus a small `ai_budget` service that counts rows in the existing `ai_call_logs` table and raises HTTP 403 when the count reaches the budget. Six routes get a guard call. Admin PATCH gains an `ai_budget_mode` field; the admin UI shows usage and a remove/restore button. Two shopping-list AI call sites are fixed to attribute their calls so counting is accurate.

**Tech Stack:** FastAPI + SQLModel/SQLAlchemy async + Alembic (backend), Vue 3 Composition API + TypeScript + Pinia + Vitest (frontend), pytest with `asyncio_mode = "auto"`.

**Spec:** `docs/superpowers/specs/2026-07-15-ai-call-budget-design.md`

## Global Constraints

- Default budget is exactly **300**, defined once as `settings.AI_CALL_BUDGET_DEFAULT`. Never hard-code 300 in app code (tests may assert the literal).
- The 403 message, verbatim everywhere: `Onboarding mode — AI features are temporarily limited. Contact the administrator to continue.` (em dash, not hyphen).
- Audit action strings: `BUDGET_REMOVE` and `BUDGET_RESTORE` (the `admin_audit_logs.action` column is `String(20)` — do not exceed 20 chars).
- `ai_call_budget` must never appear in non-admin response schemas (`backend/app/schemas/user.py` stays untouched).
- All `ai_call_logs` rows count against the budget, including `success = false` rows.
- Migration: nullable column, **no server default, no backfill** (existing users stay NULL = unlimited). `down_revision = "b1a2c3d4e5f6"` (current single head).
- Backend tests: `asyncio_mode = "auto"` is configured — write bare `async def test_...` functions, no `@pytest.mark.asyncio` marker needed. Tests need the Postgres test DB from `docker-compose.test.yml` / `TEST_DATABASE_URL` (default `postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime_test`).
- Run backend commands from `backend/`, frontend commands from `frontend/`.
- Never make real Gemini calls in tests — mock as shown in each task.
- Commit after every task (each task's final step).

---

### Task 1: Config setting, User model field, Alembic migration

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/models/user.py`
- Create: `backend/alembic/versions/f7a8b9c0d1e2_add_ai_call_budget_to_users.py`
- Test: `backend/tests/unit/test_ai_budget_service.py` (new)
- Test: `backend/tests/integration/test_ai_budget_routes.py` (new)

**Interfaces:**
- Consumes: existing `Settings` class, `User` model, fastapi-users registration route.
- Produces: `settings.AI_CALL_BUDGET_DEFAULT: int` (=300) and `User.ai_call_budget: int | None` (Python-side default = settings value; DB column nullable Integer). Later tasks read `user.ai_call_budget` and the setting.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_ai_budget_service.py`:

```python
# backend/tests/unit/test_ai_budget_service.py
from app.models.user import User
from tests.conftest import unique_email


# ── Model default ─────────────────────────────────────────────────────────────

def test_new_user_gets_default_ai_call_budget():
    user = User(email=unique_email(), hashed_password="x")
    assert user.ai_call_budget == 300


def test_ai_call_budget_can_be_set_to_none():
    user = User(email=unique_email(), hashed_password="x", ai_call_budget=None)
    assert user.ai_call_budget is None
```

Create `backend/tests/integration/test_ai_budget_routes.py`:

```python
# backend/tests/integration/test_ai_budget_routes.py
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.user import User
from tests.conftest import unique_email


async def _register_and_login(client) -> dict:
    """Register a fresh user, return {"id", "email", "token"}."""
    email = unique_email("budget")
    r = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "Pass123!"}
    )
    assert r.status_code == 201, r.json()
    user_id = r.json()["id"]
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "Pass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return {"id": user_id, "email": email, "token": login.json()["access_token"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Registration default ─────────────────────────────────────────────────────

async def test_registration_assigns_default_budget(client, db_engine):
    creds = await _register_and_login(client)

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        user = await session.get(User, uuid.UUID(creds["id"]))
        assert user is not None
        assert user.ai_call_budget == 300
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/unit/test_ai_budget_service.py tests/integration/test_ai_budget_routes.py -v
```

Expected: FAIL — `AttributeError: 'User' object has no attribute 'ai_call_budget'` (or assertion on missing attribute).

- [ ] **Step 3: Add the setting**

In `backend/app/core/config.py`, add one line after `AI_MAX_RETRIES: int = 3`:

```python
    AI_CALL_BUDGET_DEFAULT: int = 300
```

- [ ] **Step 4: Add the model field**

In `backend/app/models/user.py`:

Change the sqlalchemy import line to include `Integer`:

```python
from sqlalchemy import Column, DateTime, Integer, String, text
```

Add below the existing imports:

```python
from app.core.config import settings
```

Add this field after `meal_plan_days_ahead: int = Field(default=7)`:

```python
    # AI spending guard: number of AI calls the user may make in total.
    # NULL = unlimited (pre-feature users are grandfathered; admins can lift the cap).
    ai_call_budget: int | None = Field(
        default_factory=lambda: settings.AI_CALL_BUDGET_DEFAULT,
        sa_column=Column(Integer, nullable=True),
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/unit/test_ai_budget_service.py tests/integration/test_ai_budget_routes.py -v
```

Expected: 3 PASSED.

- [ ] **Step 6: Write the migration**

Create `backend/alembic/versions/f7a8b9c0d1e2_add_ai_call_budget_to_users.py`:

```python
"""add ai_call_budget to users

Revision ID: f7a8b9c0d1e2
Revises: b1a2c3d4e5f6
Create Date: 2026-07-15

New users receive the default budget from application code
(settings.AI_CALL_BUDGET_DEFAULT); existing rows stay NULL, which means
unlimited — pre-feature users are grandfathered on purpose. Therefore:
no server default, no backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "b1a2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ai_call_budget", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ai_call_budget")
```

- [ ] **Step 7: Verify the migration renders**

```bash
cd backend
alembic upgrade b1a2c3d4e5f6:f7a8b9c0d1e2 --sql
```

Expected output contains: `ALTER TABLE users ADD COLUMN ai_call_budget INTEGER;`
(Offline mode — no live DB needed. If env.py refuses offline mode, instead run `alembic upgrade head` against the test-stack database and confirm it applies cleanly.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/config.py backend/app/models/user.py backend/alembic/versions/f7a8b9c0d1e2_add_ai_call_budget_to_users.py backend/tests/unit/test_ai_budget_service.py backend/tests/integration/test_ai_budget_routes.py
git commit -m "feat(budget): add ai_call_budget column, default 300 for new users"
```

---

### Task 2: ai_budget service (count + enforcement)

**Files:**
- Create: `backend/app/services/ai_budget.py`
- Test: `backend/tests/unit/test_ai_budget_service.py` (extend)

**Interfaces:**
- Consumes: `User.ai_call_budget` (Task 1), `AICallLog` model (`app/models/admin.py`).
- Produces (used by Tasks 4 and 5):
  - `ONBOARDING_MODE_MESSAGE: str` — the verbatim 403 message.
  - `async def count_ai_calls(db: AsyncSession, user_id: uuid.UUID) -> int`
  - `async def ensure_ai_budget(db: AsyncSession, user: User) -> None` — raises `HTTPException(status_code=403, detail=ONBOARDING_MODE_MESSAGE)` when the budget is set and used up; no-op when `ai_call_budget` is None.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_ai_budget_service.py` (add the new imports at the top of the file, merging with the existing ones):

```python
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.admin import AICallLog
from app.services import ai_budget


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def _make_user(db: AsyncSession, *, budget: int | None) -> User:
    user = User(email=unique_email("aibudget"), hashed_password="x", ai_call_budget=budget)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _make_log(user_id: uuid.UUID, *, success: bool = True) -> AICallLog:
    return AICallLog(
        user_id=user_id,
        call_type="url_import",
        model="test-model",
        prompt_summary="prompt",
        latency_ms=10,
        input_tokens=5,
        output_tokens=5,
        success=success,
        error_message=None if success else "boom",
        created_at=datetime.now(timezone.utc),
    )


async def _add_logs(db: AsyncSession, user_id: uuid.UUID, n: int, *, success: bool = True) -> None:
    for _ in range(n):
        db.add(_make_log(user_id, success=success))
    await db.commit()


# ── count_ai_calls ────────────────────────────────────────────────────────────

async def test_count_ai_calls_zero_without_logs(db_session):
    user = await _make_user(db_session, budget=300)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 0


async def test_count_ai_calls_includes_failed_calls(db_session):
    user = await _make_user(db_session, budget=300)
    await _add_logs(db_session, user.id, 2, success=True)
    await _add_logs(db_session, user.id, 1, success=False)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 3


async def test_count_ai_calls_only_counts_own_calls(db_session):
    user = await _make_user(db_session, budget=300)
    other = await _make_user(db_session, budget=300)
    await _add_logs(db_session, other.id, 5)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 0


# ── ensure_ai_budget ──────────────────────────────────────────────────────────

async def test_ensure_ai_budget_unlimited_always_passes(db_session):
    user = await _make_user(db_session, budget=None)
    await _add_logs(db_session, user.id, 10)
    await ai_budget.ensure_ai_budget(db_session, user)  # must not raise


async def test_ensure_ai_budget_under_budget_passes(db_session):
    user = await _make_user(db_session, budget=3)
    await _add_logs(db_session, user.id, 2)
    await ai_budget.ensure_ai_budget(db_session, user)  # must not raise


async def test_ensure_ai_budget_at_budget_raises_403(db_session):
    user = await _make_user(db_session, budget=2)
    await _add_logs(db_session, user.id, 2)
    with pytest.raises(HTTPException) as exc_info:
        await ai_budget.ensure_ai_budget(db_session, user)
    assert exc_info.value.status_code == 403
    assert "Onboarding mode" in exc_info.value.detail


async def test_ensure_ai_budget_over_budget_raises_403(db_session):
    user = await _make_user(db_session, budget=1)
    await _add_logs(db_session, user.id, 5)
    with pytest.raises(HTTPException):
        await ai_budget.ensure_ai_budget(db_session, user)


async def test_ensure_ai_budget_zero_budget_blocks_immediately(db_session):
    user = await _make_user(db_session, budget=0)
    with pytest.raises(HTTPException):
        await ai_budget.ensure_ai_budget(db_session, user)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/unit/test_ai_budget_service.py -v
```

Expected: the new tests FAIL with `ModuleNotFoundError: No module named 'app.services.ai_budget'`; the two Task-1 model tests still PASS.

- [ ] **Step 3: Implement the service**

Create `backend/app/services/ai_budget.py`:

```python
# backend/app/services/ai_budget.py
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AICallLog
from app.models.user import User

ONBOARDING_MODE_MESSAGE = (
    "Onboarding mode — AI features are temporarily limited. "
    "Contact the administrator to continue."
)


async def count_ai_calls(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Total AI calls ever logged for this user. Failed calls count too —
    retries and malformed responses still consume API spend."""
    result = await db.execute(
        select(func.count()).select_from(AICallLog).where(AICallLog.user_id == user_id)
    )
    return result.scalar_one()


async def ensure_ai_budget(db: AsyncSession, user: User) -> None:
    """Raise 403 when a budgeted user has used up their AI call allowance.

    ai_call_budget is None for unlimited (grandfathered / admin-lifted) users.
    """
    if user.ai_call_budget is None:
        return
    used = await count_ai_calls(db, user.id)
    if used >= user.ai_call_budget:
        raise HTTPException(status_code=403, detail=ONBOARDING_MODE_MESSAGE)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/unit/test_ai_budget_service.py -v
```

Expected: all PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_budget.py backend/tests/unit/test_ai_budget_service.py
git commit -m "feat(budget): ai_budget service — count calls and enforce cap"
```

---

### Task 3: Attribute shopping-list AI calls

The two shopping-list AI call sites currently omit `call_type`/`user_id`/`db`, so their spend never reaches `ai_call_logs` and would not count against any budget.

**Files:**
- Modify: `backend/app/services/shopping.py` (two call sites)
- Test: `backend/tests/unit/test_shopping_attribution.py` (new)

**Interfaces:**
- Consumes: `ai_service.call_ai_structured(prompt, response_model, call_type=..., user_id=..., db=...)` (existing signature in `app/services/ai_service.py:327`).
- Produces: shopping AI calls logged with `call_type="shopping_list"` and the owning user's id.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_shopping_attribution.py`:

```python
# backend/tests/unit/test_shopping_attribution.py
"""Shopping-list AI calls must pass call_type/user_id/db so they are logged
in ai_call_logs and count against the user's AI budget."""
import datetime as _dt
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.meal_plan import MealPlan, MealPlanEntry
from app.models.recipe import Recipe, RecipeVersion
from app.models.user import User
from app.schemas.ai_responses import ShoppingListAIResult
from app.services import shopping as shopping_service
from tests.conftest import unique_email


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def _make_user_and_recipe(db: AsyncSession) -> tuple[User, Recipe]:
    user = User(email=unique_email("shopattr"), hashed_password="x")
    db.add(user)
    await db.commit()
    await db.refresh(user)

    recipe = Recipe(owner_id=user.id)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    version = RecipeVersion(
        recipe_id=recipe.id,
        title="Test Pasta",
        ingredients=[{"name": "pasta", "quantity": "200", "unit": "g"}],
        steps=[{"order": 1, "instruction": "Cook"}],
        servings=2,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)

    recipe.current_version_id = version.id
    db.add(recipe)
    await db.commit()
    return user, recipe


async def test_generate_from_entries_attributes_ai_call(db_session):
    user, recipe = await _make_user_and_recipe(db_session)
    entry = MealPlanEntry(
        user_id=user.id,
        date=_dt.date(2026, 7, 15),
        meal_type="dinner",
        recipe_id=recipe.id,
        servings=2,
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)

    mock_call = AsyncMock(return_value=ShoppingListAIResult(items=[]))
    with patch("app.services.ai_service.call_ai_structured", mock_call):
        await shopping_service.generate_shopping_list_from_entries(
            db_session, user.id, [entry.id], name="Test list"
        )

    assert mock_call.call_count == 1
    kwargs = mock_call.call_args.kwargs
    assert kwargs["call_type"] == "shopping_list"
    assert kwargs["user_id"] == user.id
    assert kwargs["db"] is db_session


async def test_regenerate_attributes_ai_call(db_session):
    user, recipe = await _make_user_and_recipe(db_session)
    plan = MealPlan(
        user_id=user.id,
        name="Week",
        start_date=_dt.date(2026, 7, 13),
        end_date=_dt.date(2026, 7, 19),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    entry = MealPlanEntry(
        meal_plan_id=plan.id,
        user_id=user.id,
        date=_dt.date(2026, 7, 15),
        meal_type="dinner",
        recipe_id=recipe.id,
        servings=2,
    )
    db_session.add(entry)
    await db_session.commit()

    mock_call = AsyncMock(return_value=ShoppingListAIResult(items=[]))
    with patch("app.services.ai_service.call_ai_structured", mock_call):
        await shopping_service.regenerate_shopping_list(db_session, user.id, plan.id)

    assert mock_call.call_count == 1
    kwargs = mock_call.call_args.kwargs
    assert kwargs["call_type"] == "shopping_list"
    assert kwargs["user_id"] == user.id
    assert kwargs["db"] is db_session
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/unit/test_shopping_attribution.py -v
```

Expected: FAIL with `KeyError: 'call_type'` (the current call sites pass no kwargs).

- [ ] **Step 3: Fix both call sites**

In `backend/app/services/shopping.py`, inside `regenerate_shopping_list` (around line 197), change:

```python
            ai_result = await ai_service.call_ai_structured(prompt, ShoppingListAIResult)
```

to:

```python
            ai_result = await ai_service.call_ai_structured(
                prompt, ShoppingListAIResult,
                call_type="shopping_list", user_id=user_id, db=db,
            )
```

Inside `generate_shopping_list_from_entries` (around line 289), change:

```python
            ai_result = await ai_service.call_ai_structured(_build_ai_prompt(raw_lines), ShoppingListAIResult)
```

to:

```python
            ai_result = await ai_service.call_ai_structured(
                _build_ai_prompt(raw_lines), ShoppingListAIResult,
                call_type="shopping_list", user_id=user_id, db=db,
            )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/unit/test_shopping_attribution.py tests/unit/test_shopping_service.py tests/integration/test_shopping_list_routes.py -v
```

Expected: all PASSED (including the pre-existing shopping suites).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/shopping.py backend/tests/unit/test_shopping_attribution.py
git commit -m "fix(shopping): attribute shopping-list AI calls to the user in ai_call_logs"
```

---

### Task 4: Guard the six AI routes

**Files:**
- Modify: `backend/app/api/routes/import_tasks.py` (3 routes)
- Modify: `backend/app/api/routes/meal_plans.py` (1 route)
- Modify: `backend/app/api/routes/shopping_lists.py` (2 routes)
- Test: `backend/tests/integration/test_ai_budget_routes.py` (extend)

**Interfaces:**
- Consumes: `ensure_ai_budget(db, user)` from Task 2; the test helpers `_register_and_login(client) -> dict` and `_auth(token) -> dict` already defined at the top of `tests/integration/test_ai_budget_routes.py` (Task 1).
- Produces: HTTP 403 with the onboarding message on all six AI routes when the budget is exhausted; test helpers `_set_budget(db_engine, user_id, budget)` and `_add_call_log(db_engine, user_id)` in the same test file (used by Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_ai_budget_routes.py` (merge imports with the existing ones at the top of the file):

```python
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import update

from app.models.admin import AICallLog

_FAKE_ID = "00000000-0000-0000-0000-000000000000"


async def _set_budget(db_engine, user_id: uuid.UUID, budget: int | None) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await session.execute(
            update(User).where(User.id == user_id).values(ai_call_budget=budget)
        )
        await session.commit()


async def _add_call_log(db_engine, user_id: uuid.UUID) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(AICallLog(
            user_id=user_id, call_type="url_import", model="test-model",
            prompt_summary="p", latency_ms=1, input_tokens=1, output_tokens=1,
            success=True, error_message=None,
            created_at=datetime.now(timezone.utc),
        ))
        await session.commit()


# ── Route guards ──────────────────────────────────────────────────────────────

async def test_exhausted_user_blocked_on_all_json_ai_routes(client, db_engine):
    creds = await _register_and_login(client)
    await _set_budget(db_engine, uuid.UUID(creds["id"]), 0)
    headers = _auth(creds["token"])

    requests = [
        ("POST /recipes/import/url",
         client.post("/api/v1/recipes/import/url",
                     json={"url": "https://example.com/r"}, headers=headers)),
        ("POST /recipes/generate",
         client.post("/api/v1/recipes/generate",
                     json={"title": "Pasta"}, headers=headers)),
        ("POST /meal-plans/suggestions",
         client.post("/api/v1/meal-plans/suggestions", json={}, headers=headers)),
        ("POST /shopping-lists/generate",
         client.post("/api/v1/shopping-lists/generate",
                     json={"entry_ids": [_FAKE_ID], "name": "L"}, headers=headers)),
        ("POST /shopping-lists/{id}/regenerate",
         client.post(f"/api/v1/shopping-lists/{_FAKE_ID}/regenerate", headers=headers)),
    ]
    for label, coro in requests:
        r = await coro
        assert r.status_code == 403, (label, r.status_code, r.text)
        assert "Onboarding mode" in r.json()["detail"], label


async def test_exhausted_user_blocked_on_image_import(client, db_engine):
    creds = await _register_and_login(client)
    await _set_budget(db_engine, uuid.UUID(creds["id"]), 0)
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("r.jpg", b"fakebytes", "image/jpeg")},
        headers=_auth(creds["token"]),
    )
    assert r.status_code == 403
    assert "Onboarding mode" in r.json()["detail"]


async def test_user_with_remaining_budget_can_start_import(client, db_engine):
    creds = await _register_and_login(client)  # default budget 300, 0 used
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/r"},
            headers=_auth(creds["token"]),
        )
    assert r.status_code == 202, r.text


async def test_budget_boundary_last_call_blocks(client, db_engine):
    creds = await _register_and_login(client)
    uid = uuid.UUID(creds["id"])
    await _set_budget(db_engine, uid, 1)
    await _add_call_log(db_engine, uid)  # used == budget
    r = await client.post(
        "/api/v1/recipes/import/url",
        json={"url": "https://example.com/r"},
        headers=_auth(creds["token"]),
    )
    assert r.status_code == 403


async def test_unlimited_user_never_blocked(client, db_engine):
    creds = await _register_and_login(client)
    uid = uuid.UUID(creds["id"])
    await _set_budget(db_engine, uid, None)
    await _add_call_log(db_engine, uid)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/r"},
            headers=_auth(creds["token"]),
        )
    assert r.status_code == 202, r.text
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/integration/test_ai_budget_routes.py -v
```

Expected: the two "blocked" tests and the boundary test FAIL — each asserted request returns a non-403 status (202 for the task-dispatching routes, 404 for the fake-ID regenerate). The "can start import" and "unlimited" tests already PASS.

- [ ] **Step 3: Add the guard to the routes**

In `backend/app/api/routes/import_tasks.py`, add to the imports:

```python
from app.services.ai_budget import ensure_ai_budget
```

Then insert `await ensure_ai_budget(db, user)` directly after each `check_import_rate_limit(str(user.id))` line — in all three handlers (`import_recipe_from_url`, `generate_recipe`, `import_recipe_from_image`). Example for the URL route:

```python
    check_import_rate_limit(str(user.id))
    await ensure_ai_budget(db, user)
```

In `backend/app/api/routes/meal_plans.py`, add the same import, then make the guard the first statement of `generate_suggestions`:

```python
async def generate_suggestions(
    data: SuggestionsRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    await ensure_ai_budget(db, user)
    task = ImportTask(user_id=user.id, task_type="meal_suggestions")
```

In `backend/app/api/routes/shopping_lists.py`, add the same import, then make the guard the first statement of both `generate_shopping_list_endpoint` and `regenerate_shopping_list`:

```python
    await ensure_ai_budget(db, user)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/integration/test_ai_budget_routes.py tests/integration/test_import_routes.py tests/integration/test_meal_plan_routes.py tests/integration/test_shopping_list_routes.py tests/integration/test_recipe_generate_route.py -v
```

Expected: all PASSED. (The pre-existing route suites must stay green — their test users get budget 300 with zero logged calls, so the guard passes.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/import_tasks.py backend/app/api/routes/meal_plans.py backend/app/api/routes/shopping_lists.py backend/tests/integration/test_ai_budget_routes.py
git commit -m "feat(budget): enforce AI call budget on all six AI routes"
```

---

### Task 5: Admin API — remove/restore budget, usage in stats

**Files:**
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/app/services/admin.py`
- Modify: `backend/app/api/routes/admin.py`
- Test: `backend/tests/integration/test_ai_budget_routes.py` (extend)

**Interfaces:**
- Consumes: `ai_budget.count_ai_calls` (Task 2), `settings.AI_CALL_BUDGET_DEFAULT` (Task 1), existing `write_audit_log` / `update_user` in `app/services/admin.py`; test helpers `_register_and_login`, `_auth` (Task 1) and `_add_call_log` (Task 4) already defined in `tests/integration/test_ai_budget_routes.py`.
- Produces:
  - `AdminUserUpdate.ai_budget_mode: Literal["unlimited", "default"] | None`
  - `AdminUserResponse.ai_call_budget: int | None`
  - `UserStatsResponse.ai_calls_used: int`
  - Audit actions `BUDGET_REMOVE` / `BUDGET_RESTORE` with descriptions "Removed AI budget for {email}" / "Restored AI budget for {email}".

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_ai_budget_routes.py`:

```python
# ── Admin budget management ───────────────────────────────────────────────────

async def test_admin_removes_budget(client, superuser_token):
    creds = await _register_and_login(client)
    r = await client.patch(
        f"/api/v1/admin/users/{creds['id']}",
        json={"ai_budget_mode": "unlimited"},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["ai_call_budget"] is None


async def test_admin_restores_budget(client, superuser_token):
    creds = await _register_and_login(client)
    await client.patch(
        f"/api/v1/admin/users/{creds['id']}",
        json={"ai_budget_mode": "unlimited"},
        headers=_auth(superuser_token),
    )
    r = await client.patch(
        f"/api/v1/admin/users/{creds['id']}",
        json={"ai_budget_mode": "default"},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["ai_call_budget"] == 300


async def test_budget_actions_write_audit_logs(client, superuser_token):
    creds = await _register_and_login(client)
    await client.patch(
        f"/api/v1/admin/users/{creds['id']}",
        json={"ai_budget_mode": "unlimited"},
        headers=_auth(superuser_token),
    )
    r = await client.get(
        "/api/v1/admin/logs/audit",
        params={"action": "BUDGET_REMOVE"},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    entries = [e for e in r.json()["items"] if e["target_user_id"] == creds["id"]]
    assert entries, "expected a BUDGET_REMOVE audit entry"
    assert entries[0]["description"] == f"Removed AI budget for {creds['email']}"


async def test_remove_budget_twice_writes_single_audit_entry(client, superuser_token):
    creds = await _register_and_login(client)
    for _ in range(2):
        r = await client.patch(
            f"/api/v1/admin/users/{creds['id']}",
            json={"ai_budget_mode": "unlimited"},
            headers=_auth(superuser_token),
        )
        assert r.status_code == 200
    r = await client.get(
        "/api/v1/admin/logs/audit",
        params={"action": "BUDGET_REMOVE"},
        headers=_auth(superuser_token),
    )
    entries = [e for e in r.json()["items"] if e["target_user_id"] == creds["id"]]
    assert len(entries) == 1  # second PATCH was a no-op


async def test_user_stats_include_ai_calls_used(client, superuser_token, db_engine):
    creds = await _register_and_login(client)
    uid = uuid.UUID(creds["id"])
    await _add_call_log(db_engine, uid)
    await _add_call_log(db_engine, uid)
    r = await client.get(
        f"/api/v1/admin/users/{creds['id']}/stats", headers=_auth(superuser_token)
    )
    assert r.status_code == 200
    assert r.json()["ai_calls_used"] == 2


async def test_admin_user_list_includes_budget(client, superuser_token):
    creds = await _register_and_login(client)
    r = await client.get(
        "/api/v1/admin/users",
        params={"search": creds["email"]},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    match = [u for u in r.json()["items"] if u["email"] == creds["email"]]
    assert match and match[0]["ai_call_budget"] == 300
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/integration/test_ai_budget_routes.py -v
```

Expected: the new admin tests FAIL (`ai_call_budget` / `ai_calls_used` missing from responses; `ai_budget_mode` ignored).

- [ ] **Step 3: Extend the admin schemas**

In `backend/app/schemas/admin.py`:

Change the typing import to include `Literal`:

```python
from typing import Any, Literal
```

Add `ai_call_budget: int | None` to `AdminUserResponse` after `preferred_units: str`:

```python
    preferred_units: str
    ai_call_budget: int | None
```

Extend `AdminUserUpdate`:

```python
class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None
    ai_budget_mode: Literal["unlimited", "default"] | None = None
```

Extend `UserStatsResponse`:

```python
class UserStatsResponse(BaseModel):
    recipe_count: int
    meal_plan_count: int
    last_active: datetime | None  # max created_at across user's recipes and meal plans
    ai_calls_used: int
```

- [ ] **Step 4: Extend the admin service**

In `backend/app/services/admin.py`:

Add to the imports:

```python
from app.core.config import settings
from app.services import ai_budget
```

In `update_user`, add the parameter and handling. New signature:

```python
async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    admin: User,
    *,
    is_active: bool | None = None,
    is_superuser: bool | None = None,
    ai_budget_mode: str | None = None,
) -> User | None:
```

Add this block after the existing `is_superuser` block, before `if changed:`:

```python
    if ai_budget_mode == "unlimited" and user.ai_call_budget is not None:
        user.ai_call_budget = None
        await write_audit_log(
            db, admin_id=admin.id, action="BUDGET_REMOVE",
            target_user_id=user_id, details={"email": user.email},
        )
        changed = True
    elif ai_budget_mode == "default" and user.ai_call_budget != settings.AI_CALL_BUDGET_DEFAULT:
        user.ai_call_budget = settings.AI_CALL_BUDGET_DEFAULT
        await write_audit_log(
            db, admin_id=admin.id, action="BUDGET_RESTORE",
            target_user_id=user_id,
            details={"email": user.email, "budget": settings.AI_CALL_BUDGET_DEFAULT},
        )
        changed = True
```

In `get_user_stats`, add the count and include it in the response:

```python
    ai_calls_used = await ai_budget.count_ai_calls(db, user_id)

    candidates = [t for t in [recipe_max, meal_max] if t is not None]
    return UserStatsResponse(
        recipe_count=recipe_count,
        meal_plan_count=meal_count,
        last_active=max(candidates) if candidates else None,
        ai_calls_used=ai_calls_used,
    )
```

In `_format_audit_description`, add two cases before `case _:`:

```python
        case "BUDGET_REMOVE":
            return f"Removed AI budget for {email}"
        case "BUDGET_RESTORE":
            return f"Restored AI budget for {email}"
```

- [ ] **Step 5: Pass the new field through the route**

In `backend/app/api/routes/admin.py`, in `update_user`, add the argument:

```python
    user = await admin_service.update_user(
        db, user_id, admin,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
        ai_budget_mode=payload.ai_budget_mode,
    )
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pytest tests/integration/test_ai_budget_routes.py tests/integration/test_admin_routes.py tests/unit/test_admin_service.py -v
```

Expected: all PASSED (pre-existing admin suites must stay green).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/admin.py backend/app/services/admin.py backend/app/api/routes/admin.py backend/tests/integration/test_ai_budget_routes.py
git commit -m "feat(admin): remove/restore AI budget per user, show usage in stats"
```

---

### Task 6: Admin UI — usage display and remove/restore button

**Files:**
- Modify: `frontend/src/types/admin.ts`
- Modify: `frontend/src/components/admin/AdminUserRow.vue`
- Test: `frontend/src/components/admin/AdminUserRow.test.ts` (new)

**Interfaces:**
- Consumes: backend fields from Task 5 (`AdminUser.ai_call_budget`, `UserStats.ai_calls_used`, `AdminUserUpdate.ai_budget_mode`). The existing `update` emit → `useAdminUsersStore.updateUser` → `adminApi.updateUser` chain passes `AdminUserUpdate` through untyped-field-free, so **no store or API-client changes are needed**.
- Produces: expanded admin row showing `AI calls: {used} / {budget}` or `AI calls: {used} · unlimited`, plus a toggle button emitting `{ ai_budget_mode: 'unlimited' | 'default' }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/admin/AdminUserRow.test.ts`:

```typescript
// frontend/src/components/admin/AdminUserRow.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminUserRow from './AdminUserRow.vue'
import type { AdminUser, UserStats } from '@/types/admin'

const baseUser: AdminUser = {
  id: 'u1',
  email: 'test@example.com',
  display_name: null,
  is_active: true,
  is_superuser: false,
  is_verified: true,
  preferred_units: 'metric',
  ai_call_budget: 300,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}

const stats: UserStats = {
  recipe_count: 1,
  meal_plan_count: 2,
  last_active: null,
  ai_calls_used: 12,
}

function mountRow(user: Partial<AdminUser> = {}) {
  return mount(AdminUserRow, {
    props: {
      user: { ...baseUser, ...user },
      isExpanded: true,
      stats,
      statsLoading: false,
    },
  })
}

describe('AdminUserRow — AI budget', () => {
  it('shows used/budget and a Remove button when a budget is set', () => {
    const wrapper = mountRow()
    expect(wrapper.find('[data-testid="ai-calls"]').text()).toBe('AI calls: 12 / 300')
    expect(wrapper.find('[data-testid="budget-toggle"]').text()).toBe('Remove AI budget')
  })

  it('shows unlimited and a Restore button when budget is null', () => {
    const wrapper = mountRow({ ai_call_budget: null })
    expect(wrapper.find('[data-testid="ai-calls"]').text()).toBe('AI calls: 12 · unlimited')
    expect(wrapper.find('[data-testid="budget-toggle"]').text()).toBe('Restore AI budget')
  })

  it('emits update with ai_budget_mode=unlimited when removing', async () => {
    const wrapper = mountRow()
    await wrapper.find('[data-testid="budget-toggle"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['u1', { ai_budget_mode: 'unlimited' }]])
  })

  it('emits update with ai_budget_mode=default when restoring', async () => {
    const wrapper = mountRow({ ai_call_budget: null })
    await wrapper.find('[data-testid="budget-toggle"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['u1', { ai_budget_mode: 'default' }]])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx vitest run src/components/admin/AdminUserRow.test.ts
```

Expected: FAIL — TypeScript error on `ai_call_budget` (unknown field) and/or `[data-testid="ai-calls"]` not found.

- [ ] **Step 3: Extend the types**

In `frontend/src/types/admin.ts`:

Add to `AdminUser` after `preferred_units`:

```typescript
  ai_call_budget: number | null
```

Add to `UserStats`:

```typescript
  ai_calls_used: number
```

Extend `AuditAction`:

```typescript
export type AuditAction =
  | 'PROMOTE' | 'DEMOTE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'CLEANUP'
  | 'BUDGET_REMOVE' | 'BUDGET_RESTORE'
```

Extend `AdminUserUpdate`:

```typescript
export interface AdminUserUpdate {
  is_active?: boolean
  is_superuser?: boolean
  ai_budget_mode?: 'unlimited' | 'default'
}
```

- [ ] **Step 4: Extend AdminUserRow.vue**

In `frontend/src/components/admin/AdminUserRow.vue`:

Add a computed after `joinedDate`:

```typescript
const aiCallsLabel = computed(() => {
  if (!props.stats) return ''
  const used = props.stats.ai_calls_used
  return props.user.ai_call_budget === null
    ? `AI calls: ${used} · unlimited`
    : `AI calls: ${used} / ${props.user.ai_call_budget}`
})
```

In the template, add a span inside the `.stats` div, after the last-active spans:

```vue
        <span data-testid="ai-calls">{{ aiCallsLabel }}</span>
```

In the `.actions` div, add this button after the Activate/Deactivate button and before the delete button:

```vue
        <button
          class="btn-action btn-budget"
          data-testid="budget-toggle"
          @click="emit('update', user.id, { ai_budget_mode: user.ai_call_budget === null ? 'default' : 'unlimited' })"
        >
          {{ user.ai_call_budget === null ? 'Restore AI budget' : 'Remove AI budget' }}
        </button>
```

Add to the scoped styles, next to the other `.btn-*` rules:

```css
.btn-budget { background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/admin/AdminUserRow.test.ts
npm run type-check
```

Expected: 4 tests PASSED; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/admin.ts frontend/src/components/admin/AdminUserRow.vue frontend/src/components/admin/AdminUserRow.test.ts
git commit -m "feat(admin-ui): show AI call usage and budget remove/restore button"
```

---

### Task 7: Surface the onboarding-mode message in user-facing flows

The backend 403 `detail` must reach the user. `TimelineView.vue` (recipe generate) already extracts `detail` and needs no change. Four spots swallow errors and need patching.

**Files:**
- Modify: `frontend/src/api/client.ts` (add exported helper)
- Modify: `frontend/src/components/AddRecipeSheet.vue` (two catch blocks)
- Modify: `frontend/src/stores/useMealPlanStore.ts` (`generateSuggestions` catch)
- Modify: `frontend/src/views/ShoppingListNewView.vue` (catch around line 163)
- Modify: `frontend/src/views/ShoppingListView.vue` (`handleRegenerate`)
- Test: `frontend/src/components/AddRecipeSheet.test.ts` (extend)

**Interfaces:**
- Produces: `getApiErrorDetail(err: unknown): string | null` exported from `@/api/client` — returns the backend `detail` string when present.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('AddRecipeSheet', ...)` block in `frontend/src/components/AddRecipeSheet.test.ts` (it already mocks `@/api/importTasks` and defines `qs`):

```typescript
  it('shows the backend detail message when the import request is rejected', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          detail:
            'Onboarding mode — AI features are temporarily limited. Contact the administrator to continue.',
        },
      },
    })

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    const input = qs<HTMLInputElement>('[data-testid="import-url-input"]')
    input.value = 'https://example.com/recipe'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    qs<HTMLButtonElement>('[data-testid="import-submit-btn"]').click()
    await flushPromises()

    expect(document.body.textContent).toContain('Onboarding mode')
    wrapper.unmount()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/AddRecipeSheet.test.ts
```

Expected: the new test FAILS (body shows the generic "Failed to start import." text instead); all pre-existing tests PASS.

- [ ] **Step 3: Add the helper**

In `frontend/src/api/client.ts`, add at the bottom (keep the existing default export):

```typescript
/** Extract the backend's human-readable `detail` string from an axios error, if any. */
export function getApiErrorDetail(err: unknown): string | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : null
}
```

- [ ] **Step 4: Patch the four swallowing error paths**

In `frontend/src/components/AddRecipeSheet.vue`, add to the imports:

```typescript
import { getApiErrorDetail } from '@/api/client'
```

Change the catch in `submitUrlImport` from:

```typescript
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start import. Please try again.'
  }
```

to:

```typescript
  } catch (err) {
    importStatus.value = 'failed'
    importError.value = getApiErrorDetail(err) ?? 'Failed to start import. Please try again.'
  }
```

Change the catch in `handleImageChange` from:

```typescript
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start image import. Please try again.'
  }
```

to:

```typescript
  } catch (err) {
    importStatus.value = 'failed'
    importError.value = getApiErrorDetail(err) ?? 'Failed to start image import. Please try again.'
  }
```

In `frontend/src/stores/useMealPlanStore.ts`, add the same import, then change the catch in `generateSuggestions` from:

```typescript
    } catch {
      suggestionLoading.value = false
    }
```

to:

```typescript
    } catch (err) {
      suggestionError.value = getApiErrorDetail(err) ?? 'Failed to start suggestions. Please try again.'
      suggestionLoading.value = false
    }
```

In `frontend/src/views/ShoppingListNewView.vue`, add the same import, then change the catch (around line 163) from:

```typescript
  } catch {
    error.value = 'Failed to start. Please try again.'
    generating.value = false
  }
```

to:

```typescript
  } catch (err) {
    error.value = getApiErrorDetail(err) ?? 'Failed to start. Please try again.'
    generating.value = false
  }
```

In `frontend/src/views/ShoppingListView.vue`, add the same import, add a ref next to the other refs in the script block:

```typescript
const regenerateError = ref<string | null>(null)
```

Change `handleRegenerate` from:

```typescript
async function handleRegenerate() {
  await store.regenerate(listId)
}
```

to:

```typescript
async function handleRegenerate() {
  regenerateError.value = null
  try {
    await store.regenerate(listId)
  } catch (err) {
    regenerateError.value = getApiErrorDetail(err) ?? 'Failed to regenerate. Please try again.'
  }
}
```

In the template, directly after the header element that contains the overflow menu (the element whose class starts with `shopping-header`), add:

```vue
    <p v-if="regenerateError" class="regenerate-error">{{ regenerateError }}</p>
```

And in the scoped styles:

```css
.regenerate-error { color: var(--color-danger); font-size: 13px; margin: 8px 0; }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/AddRecipeSheet.test.ts
npm run type-check
```

Expected: all AddRecipeSheet tests PASS (including the new one); type-check clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/AddRecipeSheet.vue frontend/src/stores/useMealPlanStore.ts frontend/src/views/ShoppingListNewView.vue frontend/src/views/ShoppingListView.vue frontend/src/components/AddRecipeSheet.test.ts
git commit -m "feat(budget): surface onboarding-mode message in AI-triggering flows"
```

---

### Task 8: Full verification and docs

**Files:**
- Modify: `CLAUDE.md` (root — data model + env var docs)
- No other code changes expected; fix any fallout the full suites reveal.

**Interfaces:**
- Consumes: everything above.
- Produces: green suites, updated docs.

- [ ] **Step 1: Run the full backend suite with lint/types**

```bash
cd backend
pytest --cov=app --cov-report=term-missing
ruff check app/
mypy app/
```

Expected: all tests PASS, ruff clean, mypy clean. Fix any failures before proceeding (do not skip or xfail).

- [ ] **Step 2: Run the full frontend suite**

```bash
cd frontend
npm run test:unit
npm run type-check
npm run lint
```

Expected: all PASS/clean.

- [ ] **Step 3: Update root CLAUDE.md**

In the root `CLAUDE.md`:

1. In the **Data Model → User** section, add `ai_call_budget` (int, nullable — AI call allowance, NULL = unlimited) to the field list.
2. In **Configuration → Optional env vars with defaults**, add:

```
AI_CALL_BUDGET_DEFAULT=300
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document ai_call_budget field and AI_CALL_BUDGET_DEFAULT setting"
```

---

## Deployment note (manual, after merge)

`deploy.sh` runs Alembic migrations on the VPS as part of the normal deploy. After deploying, verify existing users are NULL:

```sql
SELECT count(*) FILTER (WHERE ai_call_budget IS NULL) AS unlimited,
       count(*) FILTER (WHERE ai_call_budget IS NOT NULL) AS budgeted
FROM users;
```

All pre-existing users should be in the `unlimited` bucket.
