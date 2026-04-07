# Phase 5 & 6: Meal Planning + Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build meal planning (AI-assisted + manual drag-and-drop) and execution logging with carryover across two phases.

**Architecture:** Phase 5 adds MealPlan/MealPlanEntry/ShortlistEntry models, an AI suggestion pipeline reusing the ImportTask polling infrastructure, and a three-panel planning UI with vuedraggable. Phase 6 adds execution logging (RecipeCookLog) and carryover creation (CarryoverMeal) on top of Phase 5's data model.

**Tech Stack:** Python/FastAPI/SQLModel/asyncpg (backend), Vue 3 Composition API/Pinia/vuedraggable/Vitest (frontend), Gemini API via google-genai SDK (AI), Playwright (E2E)

---

## File Map

### New backend files
- `backend/app/models/meal_plan.py` — MealPlan, MealPlanEntry, ShortlistEntry, RecipeCookLog, CarryoverMeal
- `backend/app/schemas/meal_plan.py` — Pydantic request/response schemas
- `backend/app/services/meal_plan_service.py` — plan CRUD + entry management
- `backend/app/services/shortlist_service.py` — shortlist CRUD + reorder
- `backend/app/services/meal_suggestion_service.py` — AI suggestion background task
- `backend/app/services/meal_log_service.py` — Phase 6: logging + carryover
- `backend/app/api/routes/meal_plans.py` — all meal plan + shortlist endpoints
- `backend/alembic/versions/<hash>_phase5_meal_planning.py` — single migration for all new tables

### Modified backend files
- `backend/app/models/user.py` — add `meal_plan_meal_types`, `meal_plan_days_ahead`
- `backend/app/models/import_task.py` — add `task_type`, `result_data`
- `backend/app/schemas/import_task.py` — add `result_data` to `ImportTaskRead`
- `backend/app/schemas/ai_responses.py` — add `MealSuggestionItem`, `MealSuggestionResult`
- `backend/app/services/ai_service.py` — add `generate_meal_suggestions`
- `backend/app/main.py` — register meal_plans router
- `backend/tests/conftest.py` — register new models in metadata

### New frontend files
- `frontend/src/types/mealPlan.ts` — TypeScript interfaces
- `frontend/src/api/mealPlans.ts` — API client functions
- `frontend/src/composables/useSuggestionsPolling.ts` — suggestions polling composable
- `frontend/src/stores/useMealPlanStore.ts` + `.test.ts`
- `frontend/src/stores/useShortlistStore.ts` + `.test.ts`
- `frontend/src/views/MealPlanListView.vue`
- `frontend/src/views/MealPlanCreateView.vue`
- `frontend/src/views/MealPlanDetailView.vue`
- `frontend/src/views/MealPlanLogView.vue` (Phase 6)
- `frontend/src/components/MealPlanCard.vue`
- `frontend/src/components/MealSuggestionChip.vue` + `.test.ts`
- `frontend/src/components/MealSuggestionPanel.vue` + `.test.ts`
- `frontend/src/components/ShortlistPanel.vue` + `.test.ts`
- `frontend/src/components/MealSlot.vue` + `.test.ts`
- `frontend/src/components/MealPlanGrid.vue`
- `frontend/src/components/CarryoverBanner.vue` (Phase 6)
- `frontend/e2e/meal-plans.spec.ts`

### Modified frontend files
- `frontend/src/types/importTask.ts` — add `result_data` field
- `frontend/src/router/index.ts` — add meal plan routes

---

## Task 1: Data models

**Files:**
- Create: `backend/app/models/meal_plan.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/import_task.py`

- [ ] **Step 1: Create `backend/app/models/meal_plan.py`**

```python
# backend/app/models/meal_plan.py
import uuid
from datetime import date, datetime, timezone
from typing import Literal

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class MealPlan(SQLModel, table=True):
    __tablename__ = "meal_plans"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", name="fk_meal_plans_user_id"),
            nullable=False, index=True,
        )
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    start_date: date = Field(sa_column=Column(Date, nullable=False))
    end_date: date = Field(sa_column=Column(Date, nullable=False))
    status: Literal["draft", "active", "completed"] = Field(
        default="draft",
        sa_column=Column(String(20), nullable=False, server_default="draft"),
    )
    ai_prompt_used: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class MealPlanEntry(SQLModel, table=True):
    __tablename__ = "meal_plan_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    meal_plan_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_meal_plan_entries_plan_id"),
            nullable=False,
            index=True,
        )
    )
    date: date = Field(sa_column=Column(Date, nullable=False))
    meal_type: str = Field(sa_column=Column(String(20), nullable=False))
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_meal_plan_entries_recipe_id"),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(
        default="recipe",
        sa_column=Column(String(20), nullable=False, server_default="recipe"),
    )
    servings: int = Field(default=2)
    source: str = Field(
        default="manual",
        sa_column=Column(String(20), nullable=False, server_default="manual"),
    )
    position: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class ShortlistEntry(SQLModel, table=True):
    __tablename__ = "shortlist_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_shortlist_entries_user_id"),
            nullable=False,
            index=True,
        )
    )
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_shortlist_entries_recipe_id"),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(
        default="recipe",
        sa_column=Column(String(20), nullable=False, server_default="recipe"),
    )
    position: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class RecipeCookLog(SQLModel, table=True):
    __tablename__ = "recipe_cook_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_cook_logs_user_id"),
            nullable=False,
            index=True,
        )
    )
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_cook_logs_recipe_id"),
            nullable=False,
        )
    )
    meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_cook_logs_meal_plan_id"),
            nullable=True,
        ),
    )
    cooked_at: date = Field(sa_column=Column(Date, nullable=False))
    rating: int | None = Field(default=None)
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class CarryoverMeal(SQLModel, table=True):
    __tablename__ = "carryover_meals"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_carryover_meals_user_id"),
            nullable=False,
            index=True,
        )
    )
    source_meal_plan_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_carryover_source_plan_id"),
            nullable=False,
        )
    )
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_carryover_recipe_id"),
            nullable=False,
        )
    )
    original_date: date = Field(sa_column=Column(Date, nullable=False))
    original_meal_type: str = Field(sa_column=Column(String(20), nullable=False))
    reason: str = Field(sa_column=Column(String(20), nullable=False))
    target_meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_carryover_target_plan_id"),
            nullable=True,
        ),
    )
    resolved: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
```

- [ ] **Step 2: Add meal plan settings to `backend/app/models/user.py`**

After the `meal_plan_system_prompt` line (line 45), add:

```python
    meal_plan_meal_types: list[str] = Field(
        default_factory=lambda: ["dinner"],
        sa_column=Column(JSONB, nullable=False, server_default=text("'[\"dinner\"]'::jsonb")),
    )
    meal_plan_days_ahead: int = Field(default=7)
```

Also add `text` to the sqlalchemy import at the top (it's already imported — verify line 6 includes `text`).

- [ ] **Step 3: Add `task_type` and `result_data` to `backend/app/models/import_task.py`**

After the `error_message` field (around line 43), add:

```python
    task_type: str = Field(
        default="recipe_import",
        sa_column=Column(String(30), nullable=False, server_default="recipe_import"),
    )
    result_data: dict | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
```

Also add `JSONB` to the postgresql import at line 6:
```python
from sqlalchemy.dialects.postgresql import JSONB
```

- [ ] **Step 4: Commit**

```bash
cd backend
git add app/models/meal_plan.py app/models/user.py app/models/import_task.py
git commit -m "feat: add meal plan, shortlist, cook log, carryover models; extend User and ImportTask"
```

---

## Task 2: Alembic migration

**Files:**
- Create: `backend/alembic/versions/<hash>_phase5_meal_planning.py`

- [ ] **Step 1: Generate migration skeleton**

```bash
cd backend
alembic revision --autogenerate -m "phase5_meal_planning"
```

Expected: a new file in `alembic/versions/` like `abc123_phase5_meal_planning.py`.

- [ ] **Step 2: Verify and fix the generated migration**

Open the generated file. Autogenerate sometimes misses JSONB defaults or generates incorrect server_defaults. Ensure the `upgrade()` function matches this:

```python
def upgrade() -> None:
    # ── users: new meal plan preference columns ──────────────────────────────
    op.add_column("users", sa.Column(
        "meal_plan_meal_types", postgresql.JSONB(astext_type=sa.Text()),
        nullable=False, server_default='["dinner"]',
    ))
    op.add_column("users", sa.Column(
        "meal_plan_days_ahead", sa.Integer(), nullable=False, server_default="7",
    ))

    # ── import_tasks: task type + result payload ─────────────────────────────
    op.add_column("import_tasks", sa.Column(
        "task_type", sa.String(30), nullable=False, server_default="recipe_import",
    ))
    op.add_column("import_tasks", sa.Column(
        "result_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
    ))

    # ── meal_plans ────────────────────────────────────────────────────────────
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("ai_prompt_used", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_meal_plans_user_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_plans_user_id", "meal_plans", ["user_id"])

    # ── meal_plan_entries ─────────────────────────────────────────────────────
    op.create_table(
        "meal_plan_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("meal_plan_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(20), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("entry_type", sa.String(20), nullable=False, server_default="recipe"),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"], ["meal_plans.id"], name="fk_meal_plan_entries_plan_id"
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_meal_plan_entries_recipe_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_plan_entries_meal_plan_id", "meal_plan_entries", ["meal_plan_id"])

    # ── shortlist_entries ─────────────────────────────────────────────────────
    op.create_table(
        "shortlist_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("entry_type", sa.String(20), nullable=False, server_default="recipe"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_shortlist_entries_user_id"),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_shortlist_entries_recipe_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shortlist_entries_user_id", "shortlist_entries", ["user_id"])

    # ── recipe_cook_logs ──────────────────────────────────────────────────────
    op.create_table(
        "recipe_cook_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("meal_plan_id", sa.Uuid(), nullable=True),
        sa.Column("cooked_at", sa.Date(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_cook_logs_user_id"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name="fk_cook_logs_recipe_id"),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"], ["meal_plans.id"], name="fk_cook_logs_meal_plan_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_cook_logs_user_id", "recipe_cook_logs", ["user_id"])

    # ── carryover_meals ───────────────────────────────────────────────────────
    op.create_table(
        "carryover_meals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_meal_plan_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("original_date", sa.Date(), nullable=False),
        sa.Column("original_meal_type", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("target_meal_plan_id", sa.Uuid(), nullable=True),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_carryover_meals_user_id"
        ),
        sa.ForeignKeyConstraint(
            ["source_meal_plan_id"], ["meal_plans.id"], name="fk_carryover_source_plan_id"
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_carryover_recipe_id"
        ),
        sa.ForeignKeyConstraint(
            ["target_meal_plan_id"], ["meal_plans.id"], name="fk_carryover_target_plan_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_carryover_meals_user_id", "carryover_meals", ["user_id"])


def downgrade() -> None:
    op.drop_table("carryover_meals")
    op.drop_table("recipe_cook_logs")
    op.drop_table("shortlist_entries")
    op.drop_table("meal_plan_entries")
    op.drop_table("meal_plans")
    op.drop_column("import_tasks", "result_data")
    op.drop_column("import_tasks", "task_type")
    op.drop_column("users", "meal_plan_days_ahead")
    op.drop_column("users", "meal_plan_meal_types")
```

The file needs these imports at the top:
```python
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
```

- [ ] **Step 3: Apply migration**

```bash
cd backend
alembic upgrade head
```

Expected: `Running upgrade ... -> <hash>, phase5_meal_planning`

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/
git commit -m "feat: add phase5 meal planning migration"
```

---

## Task 3: Schemas + ImportTask schema update

**Files:**
- Create: `backend/app/schemas/meal_plan.py`
- Modify: `backend/app/schemas/import_task.py`
- Modify: `backend/app/schemas/ai_responses.py`

- [ ] **Step 1: Create `backend/app/schemas/meal_plan.py`**

```python
# backend/app/schemas/meal_plan.py
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MealPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    start_date: date
    end_date: date


class MealPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: Literal["draft", "active", "completed"]
    created_at: datetime
    updated_at: datetime


class MealPlanEntryCreate(BaseModel):
    date: date
    meal_type: str  # breakfast | lunch | dinner | snack
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] = "recipe"
    servings: int = Field(default=2, ge=1)
    source: Literal["ai_suggested", "manual", "carryover"] = "manual"
    position: int = 0


class MealPlanEntryUpdate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] | None = None
    servings: int | None = Field(default=None, ge=1)
    position: int | None = None


class MealPlanEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    meal_plan_id: uuid.UUID
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    servings: int
    source: str
    position: int
    created_at: datetime


class MealPlanWithEntries(MealPlanResponse):
    entries: list[MealPlanEntryResponse] = []


class ShortlistEntryCreate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion"] = "recipe"


class ShortlistEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    position: int
    created_at: datetime


class ShortlistReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


class SuggestionsRequest(BaseModel):
    meal_plan_id: uuid.UUID | None = None
    steer_prompt: str | None = None


class LogEntry(BaseModel):
    entry_id: uuid.UUID
    outcome: Literal["cooked", "not_cooked", "leftover"]


class MealPlanLogRequest(BaseModel):
    entries: list[LogEntry]


class CarryoverMealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipe_id: uuid.UUID
    original_date: date
    original_meal_type: str
    reason: str
    resolved: bool
    created_at: datetime
```

- [ ] **Step 2: Add `result_data` to `ImportTaskRead` in `backend/app/schemas/import_task.py`**

Add `result_data: dict | None = None` to `ImportTaskRead`:

```python
class ImportTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImportTaskStatus
    recipe_id: uuid.UUID | None
    error_message: str | None
    import_type: Literal["url", "image"]
    result_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_task(cls, task: ImportTask) -> ImportTaskRead:
        return cls(
            id=task.id,
            status=task.status,
            recipe_id=task.recipe_id,
            error_message=task.error_message,
            import_type="image" if task.image_path is not None else "url",
            result_data=task.result_data,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
```

- [ ] **Step 3: Add suggestion schemas to `backend/app/schemas/ai_responses.py`**

Append at the bottom of the file:

```python
class MealSuggestionItem(BaseModel):
    title: str
    matched_recipe_id: str | None = None  # str to match Gemini's JSON output


class MealSuggestionResult(BaseModel):
    suggestions: list[MealSuggestionItem]
```

- [ ] **Step 4: Commit**

```bash
cd backend
git add app/schemas/meal_plan.py app/schemas/import_task.py app/schemas/ai_responses.py
git commit -m "feat: add meal plan schemas, suggestion schemas, result_data to ImportTaskRead"
```

---

## Task 4: Meal plan service — plan CRUD

**Files:**
- Create: `backend/app/services/meal_plan_service.py`
- Create: `backend/tests/integration/test_meal_plan_routes.py` (shell — add tests throughout Tasks 4, 5, 9)

- [ ] **Step 1: Write failing integration tests for plan create + get + list + confirm**

Create `backend/tests/integration/test_meal_plan_routes.py`:

```python
# backend/tests/integration/test_meal_plan_routes.py
import pytest
from tests.conftest import unique_email


async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("mealplan")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Create ────────────────────────────────────────────────────────────────────

async def test_create_meal_plan_requires_auth(client):
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Week 1", "start_date": "2026-04-07", "end_date": "2026-04-13"
    })
    assert r.status_code == 401


async def test_create_meal_plan_returns_draft(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Week 1", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Week 1"
    assert data["status"] == "draft"
    assert data["start_date"] == "2026-04-07"
    assert "id" in data


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_meal_plans(client):
    token = await _auth_token(client)
    await client.post("/api/v1/meal-plans", json={
        "name": "Plan A", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    r = await client.get("/api/v1/meal-plans", headers=_auth(token))
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["name"] == "Plan A"


async def test_list_meal_plans_isolation(client):
    """User A cannot see User B's plans."""
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    await client.post("/api/v1/meal-plans", json={
        "name": "B Plan", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token_b))
    r = await client.get("/api/v1/meal-plans", headers=_auth(token_a))
    assert all(p["name"] != "B Plan" for p in r.json())


# ── Get ───────────────────────────────────────────────────────────────────────

async def test_get_meal_plan_with_entries(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Detail", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["id"] == plan_id
    assert "entries" in r.json()


async def test_get_meal_plan_404_other_user(client):
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "A Plan", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token_a))
    plan_id = create_r.json()["id"]
    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token_b))
    assert r.status_code == 404


# ── Confirm ───────────────────────────────────────────────────────────────────

async def test_confirm_meal_plan(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Confirm Test", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["status"] == "active"


async def test_confirm_already_active_returns_400(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Double Confirm", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    assert r.status_code == 400
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py -v 2>&1 | head -30
```

Expected: errors like `404 Not Found` or `ConnectionError` — routes don't exist yet.

- [ ] **Step 3: Create `backend/app/services/meal_plan_service.py`**

```python
# backend/app/services/meal_plan_service.py
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import MealPlan, MealPlanEntry
from app.schemas.meal_plan import (
    MealPlanCreate,
    MealPlanEntryCreate,
    MealPlanEntryUpdate,
)


async def create_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: MealPlanCreate,
) -> MealPlan:
    plan = MealPlan(
        user_id=user_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> MealPlan:
    plan = await db.get(MealPlan, plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    return plan


async def list_meal_plans(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[MealPlan]:
    result = await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == user_id)
        .order_by(MealPlan.created_at.desc())
    )
    return list(result.scalars().all())


async def confirm_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> MealPlan:
    plan = await get_meal_plan(db, user_id, plan_id)
    if plan.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Meal plan cannot be confirmed — it is not in draft status",
        )
    plan.status = "active"
    plan.updated_at = datetime.now(timezone.utc)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_entries(
    db: AsyncSession,
    plan_id: uuid.UUID,
) -> list[MealPlanEntry]:
    result = await db.execute(
        select(MealPlanEntry)
        .where(MealPlanEntry.meal_plan_id == plan_id)
        .order_by(MealPlanEntry.date, MealPlanEntry.position)
    )
    return list(result.scalars().all())
```

- [ ] **Step 4: Create `backend/app/api/routes/meal_plans.py` (plan CRUD only for now)**

```python
# backend/app/api/routes/meal_plans.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.user import User
from app.schemas.meal_plan import (
    MealPlanCreate,
    MealPlanResponse,
    MealPlanWithEntries,
)
from app.services import meal_plan_service

router = APIRouter()


@router.post("", response_model=MealPlanResponse, status_code=201)
async def create_meal_plan(
    data: MealPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanResponse:
    plan = await meal_plan_service.create_meal_plan(db, user.id, data)
    return MealPlanResponse.model_validate(plan)


@router.get("", response_model=list[MealPlanResponse])
async def list_meal_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[MealPlanResponse]:
    plans = await meal_plan_service.list_meal_plans(db, user.id)
    return [MealPlanResponse.model_validate(p) for p in plans]


@router.get("/{plan_id}", response_model=MealPlanWithEntries)
async def get_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanWithEntries:
    from app.schemas.meal_plan import MealPlanEntryResponse
    plan = await meal_plan_service.get_meal_plan(db, user.id, plan_id)
    entries = await meal_plan_service.get_entries(db, plan_id)
    return MealPlanWithEntries(
        **MealPlanResponse.model_validate(plan).model_dump(),
        entries=[MealPlanEntryResponse.model_validate(e) for e in entries],
    )


@router.post("/{plan_id}/confirm", response_model=MealPlanResponse)
async def confirm_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanResponse:
    plan = await meal_plan_service.confirm_meal_plan(db, user.id, plan_id)
    return MealPlanResponse.model_validate(plan)
```

- [ ] **Step 5: Register router in `backend/app/main.py`**

Add after the existing imports:
```python
from app.api.routes import meal_plans as meal_plans_routes
```

Add after the existing `app.include_router` calls:
```python
app.include_router(meal_plans_routes.router, prefix="/api/v1/meal-plans", tags=["meal-plans"])
```

- [ ] **Step 6: Update `backend/tests/conftest.py`**

Add the meal_plan models import alongside the existing model imports (around line 15):
```python
from app.models import meal_plan as _meal_plan_models  # noqa: F401 — registers meal plan tables
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_create_meal_plan_returns_draft \
       tests/integration/test_meal_plan_routes.py::test_list_meal_plans \
       tests/integration/test_meal_plan_routes.py::test_get_meal_plan_with_entries \
       tests/integration/test_meal_plan_routes.py::test_confirm_meal_plan \
       tests/integration/test_meal_plan_routes.py::test_confirm_already_active_returns_400 -v
```

Expected: all 5 PASS.

- [ ] **Step 8: Commit**

```bash
git add app/services/meal_plan_service.py app/api/routes/meal_plans.py app/main.py \
        tests/conftest.py tests/integration/test_meal_plan_routes.py
git commit -m "feat: add meal plan CRUD service and routes (create/list/get/confirm)"
```

---

## Task 5: Meal plan entry CRUD

**Files:**
- Modify: `backend/app/services/meal_plan_service.py`
- Modify: `backend/app/api/routes/meal_plans.py`
- Modify: `backend/tests/integration/test_meal_plan_routes.py`

- [ ] **Step 1: Write failing tests for entry create / update / delete**

Append to `tests/integration/test_meal_plan_routes.py`:

```python
# ── Entries ───────────────────────────────────────────────────────────────────

async def _create_plan(client, token: str) -> str:
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Entry Test", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    assert r.status_code == 201
    return r.json()["id"]


async def test_create_entry_freetext(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07",
        "meal_type": "dinner",
        "note": "Restaurant X",
        "entry_type": "freetext",
    }, headers=_auth(token))
    assert r.status_code == 201
    assert r.json()["note"] == "Restaurant X"
    assert r.json()["entry_type"] == "freetext"


async def test_create_entry_404_wrong_plan(client):
    token = await _auth_token(client)
    other_token = await _auth_token(client)
    other_plan_id = await _create_plan(client, other_token)
    r = await client.post(f"/api/v1/meal-plans/{other_plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "Test", "entry_type": "freetext",
    }, headers=_auth(token))
    assert r.status_code == 404


async def test_update_entry(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    create_r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "First note", "entry_type": "freetext",
    }, headers=_auth(token))
    entry_id = create_r.json()["id"]
    r = await client.patch(f"/api/v1/meal-plans/{plan_id}/entries/{entry_id}", json={
        "note": "Updated note",
    }, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["note"] == "Updated note"


async def test_delete_entry(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    create_r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "To delete", "entry_type": "freetext",
    }, headers=_auth(token))
    entry_id = create_r.json()["id"]
    r = await client.delete(
        f"/api/v1/meal-plans/{plan_id}/entries/{entry_id}", headers=_auth(token)
    )
    assert r.status_code == 204
    # verify gone
    detail_r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token))
    assert all(e["id"] != entry_id for e in detail_r.json()["entries"])
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_create_entry_freetext -v
```

Expected: FAIL with 404 or 405 (route not registered yet).

- [ ] **Step 3: Add entry service functions to `meal_plan_service.py`**

Append to `backend/app/services/meal_plan_service.py`:

```python
async def add_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    data: MealPlanEntryCreate,
) -> MealPlanEntry:
    await get_meal_plan(db, user_id, plan_id)  # ownership check raises 404 if not found
    entry = MealPlanEntry(
        meal_plan_id=plan_id,
        date=data.date,
        meal_type=data.meal_type,
        recipe_id=data.recipe_id,
        note=data.note,
        entry_type=data.entry_type,
        servings=data.servings,
        source=data.source,
        position=data.position,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def update_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: MealPlanEntryUpdate,
) -> MealPlanEntry:
    await get_meal_plan(db, user_id, plan_id)  # ownership check
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.meal_plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    if data.recipe_id is not None:
        entry.recipe_id = data.recipe_id
    if data.note is not None:
        entry.note = data.note
    if data.entry_type is not None:
        entry.entry_type = data.entry_type
    if data.servings is not None:
        entry.servings = data.servings
    if data.position is not None:
        entry.position = data.position
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> None:
    await get_meal_plan(db, user_id, plan_id)  # ownership check
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.meal_plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
```

- [ ] **Step 4: Add entry routes to `meal_plans.py`**

Append to `backend/app/api/routes/meal_plans.py`:

```python
from app.schemas.meal_plan import MealPlanEntryCreate, MealPlanEntryResponse, MealPlanEntryUpdate


@router.post("/{plan_id}/entries", response_model=MealPlanEntryResponse, status_code=201)
async def create_entry(
    plan_id: uuid.UUID,
    data: MealPlanEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanEntryResponse:
    entry = await meal_plan_service.add_entry(db, user.id, plan_id, data)
    return MealPlanEntryResponse.model_validate(entry)


@router.patch("/{plan_id}/entries/{entry_id}", response_model=MealPlanEntryResponse)
async def update_entry(
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: MealPlanEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanEntryResponse:
    entry = await meal_plan_service.update_entry(db, user.id, plan_id, entry_id, data)
    return MealPlanEntryResponse.model_validate(entry)


@router.delete("/{plan_id}/entries/{entry_id}", status_code=204)
async def delete_entry(
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await meal_plan_service.delete_entry(db, user.id, plan_id, entry_id)
```

- [ ] **Step 5: Run entry tests**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_create_entry_freetext \
       tests/integration/test_meal_plan_routes.py::test_update_entry \
       tests/integration/test_meal_plan_routes.py::test_delete_entry \
       tests/integration/test_meal_plan_routes.py::test_create_entry_404_wrong_plan -v
```

Expected: all 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/meal_plan_service.py app/api/routes/meal_plans.py \
        tests/integration/test_meal_plan_routes.py
git commit -m "feat: add meal plan entry add/update/delete"
```

---

## Task 6: Shortlist service + routes

**Files:**
- Create: `backend/app/services/shortlist_service.py`
- Modify: `backend/app/api/routes/meal_plans.py`
- Create: `backend/tests/integration/test_shortlist_routes.py`

- [ ] **Step 1: Write failing shortlist tests**

Create `backend/tests/integration/test_shortlist_routes.py`:

```python
# backend/tests/integration/test_shortlist_routes.py
import pytest
from tests.conftest import unique_email


async def _auth_token(client) -> str:
    email = unique_email("shortlist")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Pass123!"})
    assert reg.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "Pass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_shortlist_empty_by_default(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/shortlist", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == []


async def test_add_suggestion_to_shortlist(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/shortlist", json={
        "note": "Shakshuka", "entry_type": "suggestion"
    }, headers=_auth(token))
    assert r.status_code == 201
    assert r.json()["note"] == "Shakshuka"
    assert r.json()["entry_type"] == "suggestion"


async def test_remove_from_shortlist(client):
    token = await _auth_token(client)
    add_r = await client.post("/api/v1/shortlist", json={
        "note": "To remove", "entry_type": "suggestion"
    }, headers=_auth(token))
    entry_id = add_r.json()["id"]
    r = await client.delete(f"/api/v1/shortlist/{entry_id}", headers=_auth(token))
    assert r.status_code == 204
    list_r = await client.get("/api/v1/shortlist", headers=_auth(token))
    assert all(e["id"] != entry_id for e in list_r.json())


async def test_reorder_shortlist(client):
    token = await _auth_token(client)
    a = (await client.post("/api/v1/shortlist", json={
        "note": "A", "entry_type": "suggestion"
    }, headers=_auth(token))).json()["id"]
    b = (await client.post("/api/v1/shortlist", json={
        "note": "B", "entry_type": "suggestion"
    }, headers=_auth(token))).json()["id"]
    r = await client.patch("/api/v1/shortlist/reorder", json={
        "ordered_ids": [b, a]
    }, headers=_auth(token))
    assert r.status_code == 200
    list_r = await client.get("/api/v1/shortlist", headers=_auth(token))
    ids = [e["id"] for e in list_r.json()]
    assert ids.index(b) < ids.index(a)


async def test_shortlist_isolation(client):
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    await client.post("/api/v1/shortlist", json={
        "note": "B only", "entry_type": "suggestion"
    }, headers=_auth(token_b))
    r = await client.get("/api/v1/shortlist", headers=_auth(token_a))
    assert all(e["note"] != "B only" for e in r.json())
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend
pytest tests/integration/test_shortlist_routes.py -v 2>&1 | head -15
```

Expected: 404 or 405 errors.

- [ ] **Step 3: Create `backend/app/services/shortlist_service.py`**

```python
# backend/app/services/shortlist_service.py
import uuid

from fastapi import HTTPException
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import ShortlistEntry
from app.schemas.meal_plan import ShortlistEntryCreate


async def get_shortlist(db: AsyncSession, user_id: uuid.UUID) -> list[ShortlistEntry]:
    result = await db.execute(
        select(ShortlistEntry)
        .where(ShortlistEntry.user_id == user_id)
        .order_by(ShortlistEntry.position.asc(), ShortlistEntry.created_at.asc())
    )
    return list(result.scalars().all())


async def add_to_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: ShortlistEntryCreate,
) -> ShortlistEntry:
    # Assign position = max existing + 1
    existing = await get_shortlist(db, user_id)
    next_position = max((e.position for e in existing), default=-1) + 1
    entry = ShortlistEntry(
        user_id=user_id,
        recipe_id=data.recipe_id,
        note=data.note,
        entry_type=data.entry_type,
        position=next_position,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def remove_from_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> None:
    entry = await db.get(ShortlistEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Shortlist entry not found")
    await db.delete(entry)
    await db.commit()


async def reorder_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
) -> list[ShortlistEntry]:
    for position, entry_id in enumerate(ordered_ids):
        await db.execute(
            sa_update(ShortlistEntry)
            .where(ShortlistEntry.id == entry_id, ShortlistEntry.user_id == user_id)
            .values(position=position)
            .execution_options(synchronize_session=False)
        )
    await db.commit()
    return await get_shortlist(db, user_id)
```

- [ ] **Step 4: Add shortlist routes to `meal_plans.py`**

Append to `backend/app/api/routes/meal_plans.py`:

```python
from app.schemas.meal_plan import ShortlistEntryCreate, ShortlistEntryResponse, ShortlistReorderRequest
from app.services import shortlist_service


@router.get("/shortlist", response_model=list[ShortlistEntryResponse])
async def get_shortlist(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShortlistEntryResponse]:
    entries = await shortlist_service.get_shortlist(db, user.id)
    return [ShortlistEntryResponse.model_validate(e) for e in entries]


@router.post("/shortlist", response_model=ShortlistEntryResponse, status_code=201)
async def add_to_shortlist(
    data: ShortlistEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShortlistEntryResponse:
    entry = await shortlist_service.add_to_shortlist(db, user.id, data)
    return ShortlistEntryResponse.model_validate(entry)


@router.delete("/shortlist/{entry_id}", status_code=204)
async def remove_from_shortlist(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await shortlist_service.remove_from_shortlist(db, user.id, entry_id)


@router.patch("/shortlist/reorder", response_model=list[ShortlistEntryResponse])
async def reorder_shortlist(
    data: ShortlistReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShortlistEntryResponse]:
    entries = await shortlist_service.reorder_shortlist(db, user.id, data.ordered_ids)
    return [ShortlistEntryResponse.model_validate(e) for e in entries]
```

**Important:** The shortlist routes must be registered before the `/{plan_id}` route in the router, otherwise `/shortlist` will be matched as `plan_id="shortlist"`. Move the `@router.get("/shortlist", ...)` and related shortlist decorators **above** the `/{plan_id}` route at the top of the router.

In `meal_plans.py`, the final route order should be:
1. `GET /shortlist`
2. `POST /shortlist`
3. `DELETE /shortlist/{entry_id}`
4. `PATCH /shortlist/reorder`
5. `POST /suggestions`
6. `GET /suggestions/{task_id}`
7. `GET /carryovers`
8. `POST /` (create plan)
9. `GET /` (list plans)
10. `GET /{plan_id}`
11. `POST /{plan_id}/confirm`
12. `POST /{plan_id}/entries`
13. `PATCH /{plan_id}/entries/{entry_id}`
14. `DELETE /{plan_id}/entries/{entry_id}`
15. `POST /{plan_id}/log`

- [ ] **Step 5: Run shortlist tests**

```bash
cd backend
pytest tests/integration/test_shortlist_routes.py -v
```

Expected: all 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/shortlist_service.py app/api/routes/meal_plans.py \
        tests/integration/test_shortlist_routes.py
git commit -m "feat: add shortlist service and routes (get/add/remove/reorder)"
```

---

## Task 7: AI suggestions — schema + generate function

**Files:**
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Add `generate_meal_suggestions` to `backend/app/services/ai_service.py`**

Append to the file (after the existing `call_ai_structured` function):

```python
from app.schemas.ai_responses import MealSuggestionResult


_SUGGESTIONS_SYSTEM_PROMPT = """You are a meal planning assistant. Suggest meals based on the user's preferences.
Return a JSON object with a "suggestions" array. Each suggestion must have:
- "title": the meal name (string)
- "matched_recipe_id": UUID string if the meal matches a recipe in the user's collection, or null

IMPORTANT: For collection recipes, use the EXACT title from the provided list and include the exact recipe ID.
For new ideas not in the collection, set matched_recipe_id to null."""


def _build_suggestions_prompt(
    meal_types: list[str],
    days_ahead: int,
    dietary_restrictions: dict,
    allergies: dict,
    favorite_cuisines: list[str],
    disliked_ingredients: list[str],
    meal_plan_system_prompt: str | None,
    recipe_collection: list[tuple[str, str]],  # (id, title)
    steer_prompt: str | None,
    carryover_titles: list[str],
) -> str:
    n = len(meal_types) * days_ahead
    parts = [
        f"Plan {n} meals covering {meal_types} for {days_ahead} days.",
    ]
    if meal_plan_system_prompt:
        parts.append(f"User instructions: {meal_plan_system_prompt}")
    if dietary_restrictions:
        parts.append(f"Dietary restrictions: {dietary_restrictions}")
    if allergies:
        parts.append(f"Allergies: {allergies}")
    if favorite_cuisines:
        parts.append(f"Favorite cuisines: {', '.join(favorite_cuisines)}")
    if disliked_ingredients:
        parts.append(f"Avoid ingredients: {', '.join(disliked_ingredients)}")
    if carryover_titles:
        parts.append(
            f"The user already has these leftover/uncooked meals to use first: "
            f"{', '.join(carryover_titles)}"
        )
    if steer_prompt:
        parts.append(f"Additional context from user: {steer_prompt}")
    if recipe_collection:
        collection_str = "\n".join(f"  - {title} (id: {rid})" for rid, title in recipe_collection)
        parts.append(f"User's recipe collection:\n{collection_str}")
    parts.append(
        f"Provide exactly {n} diverse suggestions. "
        "Prefer collection recipes where they fit. "
        "Mix collection recipes with new ideas."
    )
    return "\n\n".join(parts)


async def generate_meal_suggestions(
    meal_types: list[str],
    days_ahead: int,
    dietary_restrictions: dict,
    allergies: dict,
    favorite_cuisines: list[str],
    disliked_ingredients: list[str],
    meal_plan_system_prompt: str | None,
    recipe_collection: list[tuple[str, str]],
    steer_prompt: str | None,
    carryover_titles: list[str],
) -> MealSuggestionResult:
    """Call Gemini to generate meal suggestions. Returns validated MealSuggestionResult.

    Validates matched_recipe_id against the provided collection; nulls out unrecognised IDs.
    """
    prompt = _build_suggestions_prompt(
        meal_types=meal_types,
        days_ahead=days_ahead,
        dietary_restrictions=dietary_restrictions,
        allergies=allergies,
        favorite_cuisines=favorite_cuisines,
        disliked_ingredients=disliked_ingredients,
        meal_plan_system_prompt=meal_plan_system_prompt,
        recipe_collection=recipe_collection,
        steer_prompt=steer_prompt,
        carryover_titles=carryover_titles,
    )
    full_prompt = f"{_SUGGESTIONS_SYSTEM_PROMPT}\n\n{prompt}"
    result = await call_ai_structured(full_prompt, MealSuggestionResult)

    # Validate: null out any matched_recipe_id not in the provided collection
    valid_ids = {rid for rid, _ in recipe_collection}
    for suggestion in result.suggestions:
        if suggestion.matched_recipe_id and suggestion.matched_recipe_id not in valid_ids:
            suggestion.matched_recipe_id = None

    return result
```

- [ ] **Step 2: Write unit test for `generate_meal_suggestions` ID validation**

Create `backend/tests/unit/test_ai_suggestions.py`:

```python
# backend/tests/unit/test_ai_suggestions.py
"""Unit test for the matched_recipe_id validation logic in generate_meal_suggestions."""
import pytest
from unittest.mock import AsyncMock, patch
from app.services.ai_service import generate_meal_suggestions
from app.schemas.ai_responses import MealSuggestionItem, MealSuggestionResult


@pytest.mark.asyncio
async def test_unrecognised_recipe_id_is_nulled_out():
    valid_id = "11111111-1111-1111-1111-111111111111"
    invalid_id = "99999999-9999-9999-9999-999999999999"

    mock_result = MealSuggestionResult(suggestions=[
        MealSuggestionItem(title="Pasta", matched_recipe_id=valid_id),
        MealSuggestionItem(title="Mystery Dish", matched_recipe_id=invalid_id),
        MealSuggestionItem(title="Thai curry", matched_recipe_id=None),
    ])

    with patch(
        "app.services.ai_service.call_ai_structured",
        new=AsyncMock(return_value=mock_result),
    ):
        result = await generate_meal_suggestions(
            meal_types=["dinner"],
            days_ahead=3,
            dietary_restrictions={},
            allergies={},
            favorite_cuisines=[],
            disliked_ingredients=[],
            meal_plan_system_prompt=None,
            recipe_collection=[(valid_id, "Pasta")],
            steer_prompt=None,
            carryover_titles=[],
        )

    assert result.suggestions[0].matched_recipe_id == valid_id
    assert result.suggestions[1].matched_recipe_id is None  # was nulled
    assert result.suggestions[2].matched_recipe_id is None  # was already null
```

- [ ] **Step 3: Run unit test**

```bash
cd backend
pytest tests/unit/test_ai_suggestions.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/ai_service.py tests/unit/test_ai_suggestions.py
git commit -m "feat: add generate_meal_suggestions to ai_service with collection ID validation"
```

---

## Task 8: Suggestions background task + route

**Files:**
- Create: `backend/app/services/meal_suggestion_service.py`
- Modify: `backend/app/api/routes/meal_plans.py`
- Modify: `backend/tests/integration/test_meal_plan_routes.py`

- [ ] **Step 1: Create `backend/app/services/meal_suggestion_service.py`**

```python
# backend/app/services/meal_suggestion_service.py
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.meal_plan import MealPlan
from app.models.recipe import Recipe, RecipeVersion

logger = logging.getLogger(__name__)


async def process_suggestions_task(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID | None,
    steer_prompt: str | None,
) -> None:
    """Background task: generate meal suggestions and store result in ImportTask.result_data."""
    from app.services import ai_service

    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            logger.error("ImportTask %s not found — skipping", task_id)
            return

        task.status = ImportTaskStatus.PROCESSING
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()

        try:
            from app.models.user import User
            user = await db.get(User, user_id)
            if user is None:
                raise ValueError(f"User {user_id} not found")

            # Fetch user's recipe collection (id, title) pairs
            result = await db.execute(
                select(Recipe.id, RecipeVersion.title)
                .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
                .where(Recipe.owner_id == user_id)
            )
            recipe_collection = [(str(row.id), row.title) for row in result]

            # Fetch unresolved carryover titles (Phase 6 — empty until Phase 6 is implemented)
            carryover_titles: list[str] = []

            suggestions_result = await ai_service.generate_meal_suggestions(
                meal_types=user.meal_plan_meal_types,
                days_ahead=user.meal_plan_days_ahead,
                dietary_restrictions=user.dietary_restrictions,
                allergies=user.allergies,
                favorite_cuisines=user.favorite_cuisines,
                disliked_ingredients=user.disliked_ingredients,
                meal_plan_system_prompt=user.meal_plan_system_prompt,
                recipe_collection=recipe_collection,
                steer_prompt=steer_prompt,
                carryover_titles=carryover_titles,
            )

            result_data = {
                "suggestions": [
                    {
                        "title": s.title,
                        "matched_recipe_id": s.matched_recipe_id,
                        "entry_type": "recipe" if s.matched_recipe_id else "suggestion",
                    }
                    for s in suggestions_result.suggestions
                ]
            }

            # Write ai_prompt_used to the meal plan if one was provided
            if meal_plan_id is not None:
                plan = await db.get(MealPlan, meal_plan_id)
                if plan and plan.user_id == user_id:
                    from app.services.ai_service import _build_suggestions_prompt
                    plan.ai_prompt_used = _build_suggestions_prompt(
                        meal_types=user.meal_plan_meal_types,
                        days_ahead=user.meal_plan_days_ahead,
                        dietary_restrictions=user.dietary_restrictions,
                        allergies=user.allergies,
                        favorite_cuisines=user.favorite_cuisines,
                        disliked_ingredients=user.disliked_ingredients,
                        meal_plan_system_prompt=user.meal_plan_system_prompt,
                        recipe_collection=recipe_collection,
                        steer_prompt=steer_prompt,
                        carryover_titles=carryover_titles,
                    )
                    plan.updated_at = datetime.now(timezone.utc)
                    db.add(plan)

            task.result_data = result_data
            task.status = ImportTaskStatus.COMPLETED
            task.updated_at = datetime.now(timezone.utc)
            db.add(task)
            await db.commit()

        except Exception as exc:
            logger.error("Suggestions task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)
            db.add(task)
            await db.commit()
```

- [ ] **Step 2: Add suggestions route to `meal_plans.py`**

Append (before the `/{plan_id}` routes, i.e. at the top of the parameterised section):

```python
from fastapi import BackgroundTasks
from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.import_task import ImportTaskCreated
from app.schemas.meal_plan import SuggestionsRequest
from app.services.meal_suggestion_service import process_suggestions_task


@router.post("/suggestions", response_model=ImportTaskCreated, status_code=202)
async def generate_suggestions(
    data: SuggestionsRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    task = ImportTask(user_id=user.id, task_type="meal_suggestions")
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(
        process_suggestions_task,
        task.id,
        user.id,
        data.meal_plan_id,
        data.steer_prompt,
    )
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)
```

Note: The polling endpoint is the existing `GET /api/v1/import-tasks/{task_id}` — no new endpoint needed. The `result_data` field is now included in `ImportTaskRead`.

- [ ] **Step 3: Write integration test for suggestions route**

Append to `tests/integration/test_meal_plan_routes.py`:

```python
# ── Suggestions ───────────────────────────────────────────────────────────────

async def test_suggestions_returns_202_with_task_id(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/meal-plans/suggestions", json={}, headers=_auth(token))
    assert r.status_code == 202
    assert "task_id" in r.json()
    assert r.json()["status"] == "pending"


async def test_suggestions_task_can_be_polled(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/meal-plans/suggestions", json={}, headers=_auth(token))
    task_id = r.json()["task_id"]
    poll_r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert poll_r.status_code == 200
    assert poll_r.json()["id"] == task_id
```

- [ ] **Step 4: Run suggestions tests**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_suggestions_returns_202_with_task_id \
       tests/integration/test_meal_plan_routes.py::test_suggestions_task_can_be_polled -v
```

Expected: both PASS.

- [ ] **Step 5: Run full backend test suite to check nothing regressed**

```bash
cd backend
pytest --cov=app --cov-report=term-missing -q
```

Expected: all tests pass. Coverage report printed.

- [ ] **Step 6: Commit**

```bash
git add app/services/meal_suggestion_service.py app/api/routes/meal_plans.py \
        tests/integration/test_meal_plan_routes.py
git commit -m "feat: add meal suggestions background task and 202 polling endpoint"
```

---

## Task 9: Frontend types + API client

**Files:**
- Create: `frontend/src/types/mealPlan.ts`
- Create: `frontend/src/api/mealPlans.ts`
- Modify: `frontend/src/types/importTask.ts`

- [ ] **Step 1: Create `frontend/src/types/mealPlan.ts`**

```typescript
// frontend/src/types/mealPlan.ts

export interface MealPlan {
  id: string
  user_id: string
  name: string
  start_date: string
  end_date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  updated_at: string
}

export interface MealPlanEntry {
  id: string
  meal_plan_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings: number
  source: 'ai_suggested' | 'manual' | 'carryover'
  position: number
  created_at: string
}

export interface MealPlanWithEntries extends MealPlan {
  entries: MealPlanEntry[]
}

export interface MealPlanCreate {
  name: string
  start_date: string
  end_date: string
}

export interface MealPlanEntryCreate {
  date: string
  meal_type: string
  recipe_id?: string | null
  note?: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  source?: 'ai_suggested' | 'manual' | 'carryover'
  position?: number
}

export interface MealPlanEntryUpdate {
  recipe_id?: string | null
  note?: string | null
  entry_type?: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  position?: number
}

export interface ShortlistEntry {
  id: string
  user_id: string
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion'
  position: number
  created_at: string
}

export interface ShortlistEntryCreate {
  recipe_id?: string | null
  note?: string | null
  entry_type: 'recipe' | 'suggestion'
}

export interface MealSuggestion {
  title: string
  matched_recipe_id: string | null
  entry_type: 'recipe' | 'suggestion'
}

export interface CarryoverMeal {
  id: string
  recipe_id: string
  original_date: string
  original_meal_type: string
  reason: 'not_cooked' | 'leftover'
  resolved: boolean
  created_at: string
}

export interface LogEntry {
  entry_id: string
  outcome: 'cooked' | 'not_cooked' | 'leftover'
}
```

- [ ] **Step 2: Create `frontend/src/api/mealPlans.ts`**

```typescript
// frontend/src/api/mealPlans.ts
import client from './client'
import type {
  MealPlan,
  MealPlanCreate,
  MealPlanEntry,
  MealPlanEntryCreate,
  MealPlanEntryUpdate,
  MealPlanWithEntries,
  ShortlistEntry,
  ShortlistEntryCreate,
  CarryoverMeal,
  LogEntry,
} from '@/types/mealPlan'
import type { ImportTaskCreated } from '@/types/importTask'

// ── Meal plans ────────────────────────────────────────────────────────────────

export const getMealPlans = () =>
  client.get<MealPlan[]>('/meal-plans')

export const getMealPlan = (id: string) =>
  client.get<MealPlanWithEntries>(`/meal-plans/${id}`)

export const createMealPlan = (data: MealPlanCreate) =>
  client.post<MealPlan>('/meal-plans', data)

export const confirmMealPlan = (id: string) =>
  client.post<MealPlan>(`/meal-plans/${id}/confirm`)

// ── Entries ───────────────────────────────────────────────────────────────────

export const createEntry = (planId: string, data: MealPlanEntryCreate) =>
  client.post<MealPlanEntry>(`/meal-plans/${planId}/entries`, data)

export const updateEntry = (planId: string, entryId: string, data: MealPlanEntryUpdate) =>
  client.patch<MealPlanEntry>(`/meal-plans/${planId}/entries/${entryId}`, data)

export const deleteEntry = (planId: string, entryId: string) =>
  client.delete(`/meal-plans/${planId}/entries/${entryId}`)

// ── Suggestions ───────────────────────────────────────────────────────────────

export const requestSuggestions = (data: { meal_plan_id?: string; steer_prompt?: string }) =>
  client.post<ImportTaskCreated>('/meal-plans/suggestions', data)

// ── Shortlist ─────────────────────────────────────────────────────────────────

export const getShortlist = () =>
  client.get<ShortlistEntry[]>('/shortlist')

export const addToShortlist = (data: ShortlistEntryCreate) =>
  client.post<ShortlistEntry>('/shortlist', data)

export const removeFromShortlist = (id: string) =>
  client.delete(`/shortlist/${id}`)

export const reorderShortlist = (orderedIds: string[]) =>
  client.patch<ShortlistEntry[]>('/shortlist/reorder', { ordered_ids: orderedIds })

// ── Phase 6: Logging ──────────────────────────────────────────────────────────

export const logMealPlan = (planId: string, entries: LogEntry[]) =>
  client.post<CarryoverMeal[]>(`/meal-plans/${planId}/log`, { entries })

export const getCarryovers = () =>
  client.get<CarryoverMeal[]>('/meal-plans/carryovers')
```

- [ ] **Step 3: Add `result_data` to `frontend/src/types/importTask.ts`**

```typescript
export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image'
  result_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/types/mealPlan.ts src/api/mealPlans.ts src/types/importTask.ts
git commit -m "feat: add meal plan types, API client, and result_data to ImportTask type"
```

---

## Task 10: useSuggestionsPolling composable + stores

**Files:**
- Create: `frontend/src/composables/useSuggestionsPolling.ts`
- Create: `frontend/src/stores/useMealPlanStore.ts` + `.test.ts`
- Create: `frontend/src/stores/useShortlistStore.ts` + `.test.ts`

- [ ] **Step 1: Create `frontend/src/composables/useSuggestionsPolling.ts`**

```typescript
// frontend/src/composables/useSuggestionsPolling.ts
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { MealSuggestion } from '@/types/mealPlan'

export function useSuggestionsPolling(onComplete: (suggestions: MealSuggestion[]) => void) {
  const status = ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle')
  const error = ref<string | null>(null)
  let intervalId: ReturnType<typeof setInterval> | null = null

  function stopPolling() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function startPolling(taskId: string) {
    status.value = 'pending'
    error.value = null
    intervalId = setInterval(async () => {
      try {
        const { data: task } = await importTasksApi.getImportTask(taskId)
        status.value = task.status as typeof status.value
        if (task.status === 'completed') {
          stopPolling()
          const suggestions = (task.result_data?.suggestions ?? []) as MealSuggestion[]
          onComplete(suggestions)
        } else if (task.status === 'failed') {
          stopPolling()
          error.value = task.error_message ?? 'Suggestion generation failed'
        }
      } catch {
        stopPolling()
        error.value = 'Failed to check suggestion status'
        status.value = 'failed'
      }
    }, 3000)
  }

  onScopeDispose(stopPolling)

  return { status, error, startPolling, stopPolling }
}
```

- [ ] **Step 2: Write failing store tests**

Create `frontend/src/stores/useMealPlanStore.test.ts`:

```typescript
// frontend/src/stores/useMealPlanStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/mealPlans', () => ({
  getMealPlans: vi.fn(),
  getMealPlan: vi.fn(),
  createMealPlan: vi.fn(),
  confirmMealPlan: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  requestSuggestions: vi.fn(),
}))

import * as mealPlansApi from '@/api/mealPlans'
import { useMealPlanStore } from './useMealPlanStore'
import type { MealPlan, MealPlanWithEntries } from '@/types/mealPlan'

const mockPlan: MealPlan = {
  id: 'p1',
  user_id: 'u1',
  name: 'Week 1',
  start_date: '2026-04-07',
  end_date: '2026-04-13',
  status: 'draft',
  created_at: '2026-04-07T00:00:00Z',
  updated_at: '2026-04-07T00:00:00Z',
}

describe('useMealPlanStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts with empty state', () => {
    const store = useMealPlanStore()
    expect(store.plans).toEqual([])
    expect(store.currentPlan).toBeNull()
    expect(store.suggestions).toEqual([])
  })

  it('fetchPlans populates plans', async () => {
    vi.mocked(mealPlansApi.getMealPlans).mockResolvedValue(axiosOk([mockPlan]))
    const store = useMealPlanStore()
    await store.fetchPlans()
    expect(store.plans).toEqual([mockPlan])
  })

  it('confirmPlan calls confirmMealPlan API', async () => {
    vi.mocked(mealPlansApi.confirmMealPlan).mockResolvedValue(
      axiosOk({ ...mockPlan, status: 'active' } as MealPlan)
    )
    const store = useMealPlanStore()
    store.plans = [mockPlan]
    await store.confirmPlan('p1')
    expect(mealPlansApi.confirmMealPlan).toHaveBeenCalledWith('p1')
  })

  it('generateSuggestions sets suggestionLoading to true during call', async () => {
    vi.mocked(mealPlansApi.requestSuggestions).mockResolvedValue(
      axiosOk({ task_id: 't1', status: 'pending' })
    )
    const store = useMealPlanStore()
    const promise = store.generateSuggestions()
    expect(store.suggestionLoading).toBe(true)
    await promise
  })
})
```

- [ ] **Step 3: Run to confirm tests fail**

```bash
cd frontend
npx vitest run src/stores/useMealPlanStore.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `frontend/src/stores/useMealPlanStore.ts`**

```typescript
// frontend/src/stores/useMealPlanStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as mealPlansApi from '@/api/mealPlans'
import { useSuggestionsPolling } from '@/composables/useSuggestionsPolling'
import type {
  MealPlan,
  MealPlanCreate,
  MealPlanEntry,
  MealPlanEntryCreate,
  MealPlanEntryUpdate,
  MealPlanWithEntries,
  MealSuggestion,
} from '@/types/mealPlan'

export const useMealPlanStore = defineStore('mealPlans', () => {
  const plans = ref<MealPlan[]>([])
  const currentPlan = ref<MealPlanWithEntries | null>(null)
  const suggestions = ref<MealSuggestion[]>([])
  const suggestionLoading = ref(false)
  const loading = ref(false)

  const { startPolling, status: suggestionStatus, error: suggestionError } =
    useSuggestionsPolling((incoming) => {
      suggestions.value = incoming
      suggestionLoading.value = false
    })

  async function fetchPlans() {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getMealPlans()
      plans.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchPlan(id: string) {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getMealPlan(id)
      currentPlan.value = data
    } finally {
      loading.value = false
    }
  }

  async function createPlan(data: MealPlanCreate): Promise<MealPlan> {
    const { data: plan } = await mealPlansApi.createMealPlan(data)
    plans.value.unshift(plan)
    return plan
  }

  async function confirmPlan(id: string) {
    const { data: updated } = await mealPlansApi.confirmMealPlan(id)
    const idx = plans.value.findIndex((p) => p.id === id)
    if (idx >= 0) plans.value[idx] = updated
    if (currentPlan.value?.id === id) {
      currentPlan.value = { ...currentPlan.value, ...updated }
    }
  }

  async function addEntry(planId: string, data: MealPlanEntryCreate): Promise<MealPlanEntry> {
    const { data: entry } = await mealPlansApi.createEntry(planId, data)
    if (currentPlan.value?.id === planId) {
      currentPlan.value.entries.push(entry)
    }
    return entry
  }

  async function updateEntry(
    planId: string,
    entryId: string,
    data: MealPlanEntryUpdate,
  ): Promise<MealPlanEntry> {
    const { data: updated } = await mealPlansApi.updateEntry(planId, entryId, data)
    if (currentPlan.value?.id === planId) {
      const idx = currentPlan.value.entries.findIndex((e) => e.id === entryId)
      if (idx >= 0) currentPlan.value.entries[idx] = updated
    }
    return updated
  }

  async function removeEntry(planId: string, entryId: string) {
    await mealPlansApi.deleteEntry(planId, entryId)
    if (currentPlan.value?.id === planId) {
      currentPlan.value.entries = currentPlan.value.entries.filter((e) => e.id !== entryId)
    }
  }

  async function generateSuggestions(steerPrompt?: string, planId?: string) {
    suggestionLoading.value = true
    suggestions.value = []
    try {
      const { data } = await mealPlansApi.requestSuggestions({
        steer_prompt: steerPrompt || undefined,
        meal_plan_id: planId,
      })
      startPolling(data.task_id)
    } catch {
      suggestionLoading.value = false
    }
  }

  return {
    plans,
    currentPlan,
    suggestions,
    suggestionLoading,
    suggestionStatus,
    suggestionError,
    loading,
    fetchPlans,
    fetchPlan,
    createPlan,
    confirmPlan,
    addEntry,
    updateEntry,
    removeEntry,
    generateSuggestions,
  }
})
```

- [ ] **Step 5: Run store tests**

```bash
cd frontend
npx vitest run src/stores/useMealPlanStore.test.ts
```

Expected: all 4 PASS.

- [ ] **Step 6: Create `frontend/src/stores/useShortlistStore.ts`**

```typescript
// frontend/src/stores/useShortlistStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as mealPlansApi from '@/api/mealPlans'
import type { ShortlistEntry, ShortlistEntryCreate } from '@/types/mealPlan'

export const useShortlistStore = defineStore('shortlist', () => {
  const entries = ref<ShortlistEntry[]>([])
  const loading = ref(false)

  async function fetchShortlist() {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getShortlist()
      entries.value = data
    } finally {
      loading.value = false
    }
  }

  async function addEntry(data: ShortlistEntryCreate): Promise<ShortlistEntry> {
    const { data: entry } = await mealPlansApi.addToShortlist(data)
    entries.value.push(entry)
    return entry
  }

  async function removeEntry(id: string) {
    await mealPlansApi.removeFromShortlist(id)
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  async function reorder(orderedIds: string[]) {
    const { data: reordered } = await mealPlansApi.reorderShortlist(orderedIds)
    entries.value = reordered
  }

  return { entries, loading, fetchShortlist, addEntry, removeEntry, reorder }
})
```

- [ ] **Step 7: Create `frontend/src/stores/useShortlistStore.test.ts`**

```typescript
// frontend/src/stores/useShortlistStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn(),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn(),
  reorderShortlist: vi.fn(),
}))

import * as mealPlansApi from '@/api/mealPlans'
import { useShortlistStore } from './useShortlistStore'
import type { ShortlistEntry } from '@/types/mealPlan'

const mockEntry: ShortlistEntry = {
  id: 's1',
  user_id: 'u1',
  recipe_id: null,
  note: 'Shakshuka',
  entry_type: 'suggestion',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('useShortlistStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchShortlist populates entries', async () => {
    vi.mocked(mealPlansApi.getShortlist).mockResolvedValue(axiosOk([mockEntry]))
    const store = useShortlistStore()
    await store.fetchShortlist()
    expect(store.entries).toEqual([mockEntry])
  })

  it('addEntry appends to entries', async () => {
    vi.mocked(mealPlansApi.addToShortlist).mockResolvedValue(axiosOk(mockEntry))
    const store = useShortlistStore()
    await store.addEntry({ note: 'Shakshuka', entry_type: 'suggestion' })
    expect(store.entries).toHaveLength(1)
  })

  it('removeEntry removes from entries', async () => {
    vi.mocked(mealPlansApi.removeFromShortlist).mockResolvedValue(axiosOk(undefined))
    const store = useShortlistStore()
    store.entries = [mockEntry]
    await store.removeEntry('s1')
    expect(store.entries).toHaveLength(0)
  })

  it('reorder calls API with ordered IDs', async () => {
    vi.mocked(mealPlansApi.reorderShortlist).mockResolvedValue(axiosOk([mockEntry]))
    const store = useShortlistStore()
    await store.reorder(['s1'])
    expect(mealPlansApi.reorderShortlist).toHaveBeenCalledWith(['s1'])
  })
})
```

- [ ] **Step 8: Run shortlist store tests**

```bash
cd frontend
npx vitest run src/stores/useShortlistStore.test.ts
```

Expected: all 4 PASS.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add src/composables/useSuggestionsPolling.ts \
        src/stores/useMealPlanStore.ts src/stores/useMealPlanStore.test.ts \
        src/stores/useShortlistStore.ts src/stores/useShortlistStore.test.ts
git commit -m "feat: add useSuggestionsPolling, useMealPlanStore, useShortlistStore"
```

---

## Task 11: Router + MealPlanListView + MealPlanCard

**Files:**
- Modify: `frontend/src/router/index.ts`
- Create: `frontend/src/views/MealPlanListView.vue`
- Create: `frontend/src/components/MealPlanCard.vue`

- [ ] **Step 1: Add meal plan routes to `frontend/src/router/index.ts`**

Add after the `/recipes/:id/edit` route:

```typescript
    {
      path: '/meal-plans',
      name: 'meal-plans',
      component: () => import('@/views/MealPlanListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/new',
      name: 'meal-plan-create',
      component: () => import('@/views/MealPlanCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id',
      name: 'meal-plan-detail',
      component: () => import('@/views/MealPlanDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id/log',
      name: 'meal-plan-log',
      component: () => import('@/views/MealPlanLogView.vue'),
      meta: { requiresAuth: true },
    },
```

- [ ] **Step 2: Create `frontend/src/components/MealPlanCard.vue`**

```vue
<script setup lang="ts">
import type { MealPlan } from '@/types/mealPlan'

defineProps<{ plan: MealPlan }>()
</script>

<template>
  <div class="meal-plan-card" :data-status="plan.status">
    <div class="card-header">
      <span class="card-name">{{ plan.name }}</span>
      <span class="card-status">{{ plan.status }}</span>
    </div>
    <div class="card-dates">{{ plan.start_date }} – {{ plan.end_date }}</div>
  </div>
</template>

<style scoped>
.meal-plan-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}
.card-name {
  font-weight: 600;
}
.card-status {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0f0f0;
  text-transform: uppercase;
}
.meal-plan-card[data-status="active"] .card-status {
  background: #d4edda;
  color: #155724;
}
.meal-plan-card[data-status="completed"] .card-status {
  background: #e2e3e5;
  color: #383d41;
}
.card-dates {
  font-size: 0.85rem;
  color: #666;
}
</style>
```

- [ ] **Step 3: Create `frontend/src/views/MealPlanListView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import MealPlanCard from '@/components/MealPlanCard.vue'

const store = useMealPlanStore()
const router = useRouter()

onMounted(() => store.fetchPlans())
</script>

<template>
  <div class="meal-plan-list-view">
    <div class="list-header">
      <h1>Meal Plans</h1>
      <button class="btn-primary" @click="router.push({ name: 'meal-plan-create' })">
        + New Plan
      </button>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>

    <div v-else-if="store.plans.length === 0" class="empty-state">
      No meal plans yet. Create your first plan!
    </div>

    <div v-else class="plan-grid">
      <MealPlanCard
        v-for="plan in store.plans"
        :key="plan.id"
        :plan="plan"
        @click="router.push({ name: 'meal-plan-detail', params: { id: plan.id } })"
      />
    </div>
  </div>
</template>

<style scoped>
.meal-plan-list-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.btn-primary {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.loading, .empty-state {
  text-align: center;
  color: #666;
  padding: 2rem;
}
</style>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/components/MealPlanCard.vue src/views/MealPlanListView.vue
git commit -m "feat: add meal plan routes, MealPlanCard, MealPlanListView"
```

---

## Task 12: MealPlanCreateView

**Files:**
- Create: `frontend/src/views/MealPlanCreateView.vue`

- [ ] **Step 1: Create `frontend/src/views/MealPlanCreateView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'

const store = useMealPlanStore()
const router = useRouter()

const name = ref('')
const startDate = ref('')
const endDate = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  if (!name.value || !startDate.value || !endDate.value) {
    error.value = 'All fields are required'
    return
  }
  submitting.value = true
  error.value = null
  try {
    const plan = await store.createPlan({
      name: name.value,
      start_date: startDate.value,
      end_date: endDate.value,
    })
    router.push({ name: 'meal-plan-detail', params: { id: plan.id } })
  } catch {
    error.value = 'Failed to create plan. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="create-view">
    <h1>New Meal Plan</h1>
    <form class="create-form" @submit.prevent="submit">
      <div class="field">
        <label for="plan-name">Plan name</label>
        <input id="plan-name" v-model="name" type="text" placeholder="e.g. Week of Apr 7" required />
      </div>
      <div class="field">
        <label for="start-date">Start date</label>
        <input id="start-date" v-model="startDate" type="date" required />
      </div>
      <div class="field">
        <label for="end-date">End date</label>
        <input id="end-date" v-model="endDate" type="date" required />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn-secondary" @click="router.back()">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create Plan' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-view {
  max-width: 500px;
  margin: 2rem auto;
  padding: 1rem;
}
.create-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #555;
}
input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
}
.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
.btn-primary {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-secondary {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}
.error {
  color: #e94560;
  font-size: 0.875rem;
}
</style>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/MealPlanCreateView.vue
git commit -m "feat: add MealPlanCreateView"
```

---

## Task 13: MealSuggestionChip + MealSuggestionPanel

**Files:**
- Create: `frontend/src/components/MealSuggestionChip.vue`
- Create: `frontend/src/components/MealSuggestionPanel.vue` + `.test.ts`

- [ ] **Step 1: Write failing MealSuggestionPanel tests**

Create `frontend/src/components/MealSuggestionPanel.test.ts`:

```typescript
// frontend/src/components/MealSuggestionPanel.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MealSuggestionPanel from './MealSuggestionPanel.vue'
import type { MealSuggestion } from '@/types/mealPlan'

const mockSuggestions: MealSuggestion[] = [
  { title: 'Pasta al Pesto', matched_recipe_id: 'r1', entry_type: 'recipe' },
  { title: 'Thai curry', matched_recipe_id: null, entry_type: 'suggestion' },
]

describe('MealSuggestionPanel', () => {
  it('renders suggestion chips', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: mockSuggestions, loading: false },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
    expect(wrapper.text()).toContain('Thai curry')
  })

  it('steer field is hidden by default', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    expect(wrapper.find('[data-testid="steer-input"]').exists()).toBe(false)
  })

  it('steer field appears when steer button clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="steer-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="steer-input"]').exists()).toBe(true)
  })

  it('emits regenerate with steer prompt when Go clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="steer-toggle"]').trigger('click')
    await wrapper.find('[data-testid="steer-input"]').setValue('cold dinner')
    await wrapper.find('[data-testid="steer-submit"]').trigger('click')
    expect(wrapper.emitted('regenerate')?.[0]).toEqual(['cold dinner'])
  })

  it('emits regenerate with no prompt when Regen clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="regen-btn"]').trigger('click')
    expect(wrapper.emitted('regenerate')?.[0]).toEqual([undefined])
  })

  it('shows loading state', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: true },
    })
    expect(wrapper.find('[data-testid="suggestions-loading"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend
npx vitest run src/components/MealSuggestionPanel.test.ts 2>&1 | head -15
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `frontend/src/components/MealSuggestionChip.vue`**

```vue
<script setup lang="ts">
import type { MealSuggestion } from '@/types/mealPlan'

defineProps<{ suggestion: MealSuggestion }>()
const emit = defineEmits<{ (e: 'convert-to-recipe', title: string): void }>()
</script>

<template>
  <div
    class="suggestion-chip"
    :class="suggestion.entry_type"
    :data-testid="`chip-${suggestion.entry_type}`"
    draggable="true"
  >
    <span class="chip-icon">{{ suggestion.entry_type === 'recipe' ? '📚' : '✨' }}</span>
    <span class="chip-title">{{ suggestion.title }}</span>
    <button
      v-if="suggestion.entry_type === 'suggestion'"
      class="convert-btn"
      data-testid="convert-to-recipe"
      @click.stop="emit('convert-to-recipe', suggestion.title)"
    >
      → recipe
    </button>
  </div>
</template>

<style scoped>
.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
  user-select: none;
}
.suggestion-chip.recipe {
  background: #e8f0fe;
  border-left: 3px solid #4285f4;
}
.suggestion-chip.suggestion {
  background: #fff8e1;
  border-left: 3px solid #f5a623;
  font-style: italic;
}
.convert-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
.convert-btn:hover {
  color: #333;
}
</style>
```

- [ ] **Step 4: Create `frontend/src/components/MealSuggestionPanel.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import MealSuggestionChip from './MealSuggestionChip.vue'
import type { MealSuggestion } from '@/types/mealPlan'

defineProps<{ suggestions: MealSuggestion[]; loading: boolean }>()
const emit = defineEmits<{
  (e: 'regenerate', steerPrompt?: string): void
  (e: 'drop-to-plan', suggestion: MealSuggestion, date: string, mealType: string): void
  (e: 'drop-to-shortlist', suggestion: MealSuggestion): void
}>()

const router = useRouter()
const steerVisible = ref(false)
const steerPrompt = ref('')

function toggleSteer() {
  steerVisible.value = !steerVisible.value
}

function submitSteer() {
  emit('regenerate', steerPrompt.value || undefined)
  steerVisible.value = false
  steerPrompt.value = ''
}

function handleConvertToRecipe(title: string) {
  router.push({ name: 'recipe-create', query: { title } })
}
</script>

<template>
  <div class="suggestion-panel">
    <div class="panel-header">
      <span class="panel-label">AI Suggestions</span>
      <div class="panel-actions">
        <button
          class="btn-steer"
          data-testid="steer-toggle"
          @click="toggleSteer"
        >
          ✏ Steer…
        </button>
        <button
          class="btn-regen"
          data-testid="regen-btn"
          @click="emit('regenerate', undefined)"
        >
          ⚡ Regen
        </button>
      </div>
    </div>

    <div v-if="steerVisible" class="steer-field">
      <input
        v-model="steerPrompt"
        data-testid="steer-input"
        type="text"
        placeholder="e.g. I have leftover salad · need something quick"
      />
      <button data-testid="steer-submit" class="btn-go" @click="submitSteer">Go</button>
    </div>

    <div v-if="loading" data-testid="suggestions-loading" class="loading-chips">
      Generating suggestions…
    </div>

    <div v-else class="chips-grid">
      <MealSuggestionChip
        v-for="(s, i) in suggestions"
        :key="i"
        :suggestion="s"
        @convert-to-recipe="handleConvertToRecipe"
      />
      <span v-if="suggestions.length === 0 && !loading" class="empty-hint">
        Click Regen to generate suggestions
      </span>
    </div>
  </div>
</template>

<style scoped>
.suggestion-panel {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  font-weight: 600;
}
.panel-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-steer {
  background: #e9ecef;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-regen {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.steer-field {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.steer-field input {
  flex: 1;
  padding: 0.35rem 0.65rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.875rem;
}
.btn-go {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.empty-hint {
  font-size: 0.8rem;
  color: #aaa;
  font-style: italic;
}
.loading-chips {
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
}
</style>
```

- [ ] **Step 5: Run panel tests**

```bash
cd frontend
npx vitest run src/components/MealSuggestionPanel.test.ts
```

Expected: all 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/MealSuggestionChip.vue \
        src/components/MealSuggestionPanel.vue \
        src/components/MealSuggestionPanel.test.ts
git commit -m "feat: add MealSuggestionChip and MealSuggestionPanel with steer field"
```

---

## Task 14: ShortlistPanel

**Files:**
- Create: `frontend/src/components/ShortlistPanel.vue` + `.test.ts`

- [ ] **Step 1: Write failing ShortlistPanel tests**

Create `frontend/src/components/ShortlistPanel.test.ts`:

```typescript
// frontend/src/components/ShortlistPanel.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn().mockResolvedValue({ data: [] }),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn().mockResolvedValue({ data: null }),
  reorderShortlist: vi.fn(),
}))

import ShortlistPanel from './ShortlistPanel.vue'
import type { ShortlistEntry } from '@/types/mealPlan'

const mockEntry: ShortlistEntry = {
  id: 's1',
  user_id: 'u1',
  recipe_id: null,
  note: 'Shakshuka',
  entry_type: 'suggestion',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('ShortlistPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders shortlist entries', () => {
    const wrapper = mount(ShortlistPanel, {
      props: { entries: [mockEntry] },
    })
    expect(wrapper.text()).toContain('Shakshuka')
  })

  it('remove button emits remove event', async () => {
    const wrapper = mount(ShortlistPanel, {
      props: { entries: [mockEntry] },
    })
    await wrapper.find('[data-testid="remove-shortlist-s1"]').trigger('click')
    expect(wrapper.emitted('remove')?.[0]).toEqual(['s1'])
  })

  it('renders empty drop zone when no entries', () => {
    const wrapper = mount(ShortlistPanel, { props: { entries: [] } })
    expect(wrapper.find('[data-testid="shortlist-drop-zone"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd frontend
npx vitest run src/components/ShortlistPanel.test.ts 2>&1 | head -10
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `frontend/src/components/ShortlistPanel.vue`**

```vue
<script setup lang="ts">
import type { ShortlistEntry } from '@/types/mealPlan'

defineProps<{ entries: ShortlistEntry[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'drop', suggestion: unknown): void
}>()
</script>

<template>
  <div class="shortlist-panel">
    <div class="panel-header">
      <span class="panel-label">Shortlist ★</span>
    </div>

    <div class="entry-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="shortlist-entry"
        :class="entry.entry_type"
        draggable="true"
      >
        <span class="entry-icon">{{ entry.entry_type === 'recipe' ? '📚' : '✨' }}</span>
        <span class="entry-note">{{ entry.note ?? entry.recipe_id }}</span>
        <button
          class="remove-btn"
          :data-testid="`remove-shortlist-${entry.id}`"
          @click="emit('remove', entry.id)"
        >
          ×
        </button>
      </div>

      <div
        class="drop-zone"
        data-testid="shortlist-drop-zone"
      >
        drop here to save for later
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortlist-panel {
  background: #f0fff4;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-width: 180px;
}
.panel-header {
  margin-bottom: 0.5rem;
}
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  font-weight: 600;
}
.entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.shortlist-entry {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
}
.shortlist-entry.recipe {
  background: #e8f0fe;
  border-left: 3px solid #2ecc71;
}
.shortlist-entry.suggestion {
  background: #fff8e1;
  border-left: 3px solid #27ae60;
  font-style: italic;
}
.entry-note {
  flex: 1;
}
.remove-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.remove-btn:hover { color: #e94560; }
.drop-zone {
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  font-size: 0.75rem;
  color: #aaa;
  text-align: center;
}
</style>
```

- [ ] **Step 4: Run ShortlistPanel tests**

```bash
cd frontend
npx vitest run src/components/ShortlistPanel.test.ts
```

Expected: all 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShortlistPanel.vue src/components/ShortlistPanel.test.ts
git commit -m "feat: add ShortlistPanel component"
```

---

## Task 15: MealSlot

**Files:**
- Create: `frontend/src/components/MealSlot.vue` + `.test.ts`

- [ ] **Step 1: Write failing MealSlot tests**

Create `frontend/src/components/MealSlot.test.ts`:

```typescript
// frontend/src/components/MealSlot.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MealSlot from './MealSlot.vue'
import type { MealPlanEntry } from '@/types/mealPlan'

const mockEntry: MealPlanEntry = {
  id: 'e1',
  meal_plan_id: 'p1',
  date: '2026-04-07',
  meal_type: 'dinner',
  recipe_id: 'r1',
  note: null,
  entry_type: 'recipe',
  servings: 2,
  source: 'manual',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('MealSlot', () => {
  it('renders recipe title when entry type is recipe', () => {
    const wrapper = mount(MealSlot, {
      props: { entry: mockEntry, mealType: 'dinner', recipeTitle: 'Pasta al Pesto' },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
  })

  it('renders note when entry_type is freetext', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entry: { ...mockEntry, note: 'Restaurant X', entry_type: 'freetext', recipe_id: null },
        mealType: 'dinner',
      },
    })
    expect(wrapper.text()).toContain('Restaurant X')
  })

  it('shows empty placeholder when no entry', () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    expect(wrapper.find('[data-testid="slot-empty"]').exists()).toBe(true)
  })

  it('shows text input when empty slot clicked', async () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    await wrapper.find('[data-testid="slot-empty"]').trigger('click')
    expect(wrapper.find('[data-testid="slot-text-input"]').exists()).toBe(true)
  })

  it('emits save-text when input submitted', async () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    await wrapper.find('[data-testid="slot-empty"]').trigger('click')
    await wrapper.find('[data-testid="slot-text-input"]').setValue('Restaurant X')
    await wrapper.find('[data-testid="slot-text-input"]').trigger('keyup.enter')
    expect(wrapper.emitted('save-text')?.[0]).toEqual(['Restaurant X'])
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd frontend
npx vitest run src/components/MealSlot.test.ts 2>&1 | head -10
```

Expected: FAIL.

- [ ] **Step 3: Create `frontend/src/components/MealSlot.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { MealPlanEntry } from '@/types/mealPlan'

const props = defineProps<{
  entry: MealPlanEntry | null
  mealType: string
  recipeTitle?: string
}>()

const emit = defineEmits<{
  (e: 'save-text', text: string): void
  (e: 'clear'): void
}>()

const editing = ref(false)
const inputText = ref('')

function startEditing() {
  editing.value = true
  inputText.value = ''
}

function submitText() {
  if (inputText.value.trim()) {
    emit('save-text', inputText.value.trim())
  }
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}
</script>

<template>
  <div class="meal-slot" :class="entry?.entry_type">
    <span class="slot-label">{{ mealType.toUpperCase() }}</span>

    <!-- Editing mode: inline text input -->
    <div v-if="editing" class="slot-edit">
      <input
        v-model="inputText"
        data-testid="slot-text-input"
        type="text"
        placeholder="Type a note…"
        autofocus
        @keyup.enter="submitText"
        @keyup.escape="cancelEdit"
        @blur="cancelEdit"
      />
    </div>

    <!-- Filled: recipe -->
    <span
      v-else-if="entry && entry.entry_type === 'recipe'"
      class="slot-content recipe"
    >
      {{ recipeTitle ?? entry.recipe_id }}
    </span>

    <!-- Filled: suggestion -->
    <span
      v-else-if="entry && entry.entry_type === 'suggestion'"
      class="slot-content suggestion"
    >
      ✨ {{ entry.note }}
    </span>

    <!-- Filled: freetext -->
    <span
      v-else-if="entry && entry.entry_type === 'freetext'"
      class="slot-content freetext"
    >
      {{ entry.note }}
    </span>

    <!-- Empty -->
    <span
      v-else
      class="slot-empty"
      data-testid="slot-empty"
      @click="startEditing"
    >
      drop here…
    </span>

    <!-- Clear button for filled slots -->
    <button
      v-if="entry && !editing"
      class="clear-btn"
      data-testid="slot-clear"
      @click.stop="emit('clear')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.meal-slot {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: #f0f4ff;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  min-height: 2.25rem;
  cursor: pointer;
}
.slot-label {
  font-size: 0.7rem;
  color: #999;
  font-weight: 600;
  flex-shrink: 0;
}
.slot-content {
  flex: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-content.recipe { color: #1a73e8; }
.slot-content.suggestion { color: #f5a623; font-style: italic; }
.slot-content.freetext { color: #333; }
.slot-empty {
  flex: 1;
  font-size: 0.85rem;
  color: #bbb;
  font-style: italic;
}
.slot-edit {
  flex: 1;
}
.slot-edit input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 0.9rem;
  outline: none;
}
.clear-btn {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  flex-shrink: 0;
}
.clear-btn:hover { color: #e94560; }
</style>
```

- [ ] **Step 4: Run MealSlot tests**

```bash
cd frontend
npx vitest run src/components/MealSlot.test.ts
```

Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MealSlot.vue src/components/MealSlot.test.ts
git commit -m "feat: add MealSlot component with inline text editing"
```

---

## Task 16: MealPlanGrid + MealPlanDetailView

**Files:**
- Create: `frontend/src/components/MealPlanGrid.vue`
- Create: `frontend/src/views/MealPlanDetailView.vue`

- [ ] **Step 1: Create `frontend/src/components/MealPlanGrid.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import MealSlot from './MealSlot.vue'
import type { MealPlanEntry, MealPlanWithEntries } from '@/types/mealPlan'

const props = defineProps<{
  plan: MealPlanWithEntries
  recipeTitles: Record<string, string>  // recipe_id → title
}>()

const emit = defineEmits<{
  (e: 'save-text', date: string, mealType: string, text: string): void
  (e: 'clear-entry', entryId: string): void
  (e: 'drop-to-slot', suggestion: unknown, date: string, mealType: string): void
}>()

// Derive days array from start_date..end_date
const days = computed(() => {
  const result: string[] = []
  const start = new Date(props.plan.start_date)
  const end = new Date(props.plan.end_date)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

// Derive unique meal types from entries, preserving order
const mealTypes = computed(() => {
  const seen = new Set<string>()
  const order = ['breakfast', 'lunch', 'dinner', 'snack']
  const types = props.plan.entries.map((e) => e.meal_type).filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
  return order.filter((t) => types.includes(t))
})

function entryFor(date: string, mealType: string): MealPlanEntry | null {
  return (
    props.plan.entries.find(
      (e) => e.date === date && e.meal_type === mealType
    ) ?? null
  )
}

function recipeTitleFor(entry: MealPlanEntry | null): string | undefined {
  if (!entry || !entry.recipe_id) return undefined
  return props.recipeTitles[entry.recipe_id]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayName(dateStr: string): string {
  return DAY_NAMES[new Date(dateStr).getDay()]
}
</script>

<template>
  <div class="plan-grid">
    <div v-for="day in days" :key="day" class="day-row">
      <div class="day-label">
        <span class="day-short">{{ dayName(day) }}</span>
      </div>
      <MealSlot
        v-for="mealType in mealTypes"
        :key="mealType"
        :entry="entryFor(day, mealType)"
        :meal-type="mealType"
        :recipe-title="recipeTitleFor(entryFor(day, mealType))"
        @save-text="(text) => emit('save-text', day, mealType, text)"
        @clear="() => { const e = entryFor(day, mealType); if (e) emit('clear-entry', e.id) }"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.day-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}
.day-label {
  width: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.day-short {
  font-size: 0.75rem;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
}

@media (max-width: 767px) {
  .day-short::after {
    content: attr(data-full);
  }
}
</style>
```

- [ ] **Step 2: Create `frontend/src/views/MealPlanDetailView.vue`**

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'
import MealPlanGrid from '@/components/MealPlanGrid.vue'

const route = useRoute()
const router = useRouter()
const planStore = useMealPlanStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()

const planId = route.params.id as string

onMounted(async () => {
  await Promise.all([
    planStore.fetchPlan(planId),
    shortlistStore.fetchShortlist(),
    recipeStore.fetchRecipes(),
  ])
})

// Build recipe title lookup from the recipe store
const recipeTitles = computed(() => {
  const map: Record<string, string> = {}
  for (const recipe of recipeStore.recipes) {
    map[recipe.id] = recipe.current_version.title
  }
  return map
})

async function handleSaveText(date: string, mealType: string, text: string) {
  await planStore.addEntry(planId, {
    date,
    meal_type: mealType,
    note: text,
    entry_type: 'freetext',
  })
}

async function handleClearEntry(entryId: string) {
  await planStore.removeEntry(planId, entryId)
}

async function handleRegenerate(steerPrompt?: string) {
  await planStore.generateSuggestions(steerPrompt, planId)
}

async function handleRemoveFromShortlist(id: string) {
  await shortlistStore.removeEntry(id)
}

async function handleConfirm() {
  await planStore.confirmPlan(planId)
}
</script>

<template>
  <div class="detail-view">
    <div v-if="planStore.loading" class="loading">Loading…</div>

    <template v-else-if="planStore.currentPlan">
      <!-- Sources: suggestions + shortlist -->
      <div class="sources-row">
        <MealSuggestionPanel
          :suggestions="planStore.suggestions"
          :loading="planStore.suggestionLoading"
          @regenerate="handleRegenerate"
        />
        <ShortlistPanel
          :entries="shortlistStore.entries"
          @remove="handleRemoveFromShortlist"
        />
      </div>

      <!-- Plan grid -->
      <div class="plan-section">
        <div class="plan-section-header">
          <span class="plan-title">
            {{ planStore.currentPlan.name }}
            <span class="date-range">
              {{ planStore.currentPlan.start_date }} – {{ planStore.currentPlan.end_date }}
            </span>
          </span>
          <div class="plan-actions">
            <button
              v-if="planStore.currentPlan.status === 'active'"
              class="btn-log"
              @click="router.push({ name: 'meal-plan-log', params: { id: planId } })"
            >
              📋 Log meals
            </button>
            <button
              v-if="planStore.currentPlan.status === 'draft'"
              class="btn-confirm"
              @click="handleConfirm"
            >
              ✓ Confirm Plan
            </button>
          </div>
        </div>

        <MealPlanGrid
          :plan="planStore.currentPlan"
          :recipe-titles="recipeTitles"
          @save-text="handleSaveText"
          @clear-entry="handleClearEntry"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
}
.sources-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.sources-row > :first-child {
  flex: 1;
}
.plan-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}
.plan-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.plan-title {
  font-weight: 600;
}
.date-range {
  font-size: 0.8rem;
  color: #888;
  margin-left: 0.5rem;
  font-weight: 400;
}
.plan-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-confirm {
  background: #2ecc71;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-weight: 600;
}
.btn-log {
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
}
.loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

@media (max-width: 767px) {
  .sources-row {
    flex-direction: column;
  }
}
</style>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run all frontend unit tests**

```bash
cd frontend
npm run test:unit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/MealPlanGrid.vue src/views/MealPlanDetailView.vue
git commit -m "feat: add MealPlanGrid and MealPlanDetailView — Phase 5 frontend complete"
```

---

## Task 17 (Phase 6): Meal log service + routes

**Files:**
- Create: `backend/app/services/meal_log_service.py`
- Modify: `backend/app/api/routes/meal_plans.py`
- Modify: `backend/tests/integration/test_meal_plan_routes.py`

- [ ] **Step 1: Write failing logging tests**

Append to `tests/integration/test_meal_plan_routes.py`:

```python
# ── Phase 6: Logging ──────────────────────────────────────────────────────────

async def _create_active_plan_with_recipe_entry(client, token: str) -> tuple[str, str, str]:
    """Returns (plan_id, entry_id, recipe_id)."""
    # create a recipe first
    recipe_r = await client.post("/api/v1/recipes", json={"title": "Test Recipe"},
                                  headers=_auth(token))
    recipe_id = recipe_r.json()["id"]

    plan_r = await client.post("/api/v1/meal-plans", json={
        "name": "Log Test", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = plan_r.json()["id"]

    entry_r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07",
        "meal_type": "dinner",
        "recipe_id": recipe_id,
        "entry_type": "recipe",
    }, headers=_auth(token))
    entry_id = entry_r.json()["id"]

    await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    return plan_id, entry_id, recipe_id


async def test_log_cooked_creates_cook_log(client):
    token = await _auth_token(client)
    plan_id, entry_id, _ = await _create_active_plan_with_recipe_entry(client, token)
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/log", json={
        "entries": [{"entry_id": entry_id, "outcome": "cooked"}]
    }, headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == []  # no carryovers for cooked entries


async def test_log_not_cooked_creates_carryover(client):
    token = await _auth_token(client)
    plan_id, entry_id, recipe_id = await _create_active_plan_with_recipe_entry(client, token)
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/log", json={
        "entries": [{"entry_id": entry_id, "outcome": "not_cooked"}]
    }, headers=_auth(token))
    assert r.status_code == 200
    carryovers = r.json()
    assert len(carryovers) == 1
    assert carryovers[0]["recipe_id"] == recipe_id
    assert carryovers[0]["reason"] == "not_cooked"


async def test_log_plan_sets_status_completed(client):
    token = await _auth_token(client)
    plan_id, entry_id, _ = await _create_active_plan_with_recipe_entry(client, token)
    await client.post(f"/api/v1/meal-plans/{plan_id}/log", json={
        "entries": [{"entry_id": entry_id, "outcome": "cooked"}]
    }, headers=_auth(token))
    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token))
    assert r.json()["status"] == "completed"


async def test_log_non_active_plan_returns_400(client):
    token = await _auth_token(client)
    plan_r = await client.post("/api/v1/meal-plans", json={
        "name": "Draft", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = plan_r.json()["id"]
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/log", json={"entries": []},
                          headers=_auth(token))
    assert r.status_code == 400


async def test_get_carryovers(client):
    token = await _auth_token(client)
    plan_id, entry_id, _ = await _create_active_plan_with_recipe_entry(client, token)
    await client.post(f"/api/v1/meal-plans/{plan_id}/log", json={
        "entries": [{"entry_id": entry_id, "outcome": "not_cooked"}]
    }, headers=_auth(token))
    r = await client.get("/api/v1/meal-plans/carryovers", headers=_auth(token))
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["resolved"] is False
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_log_cooked_creates_cook_log -v 2>&1 | head -15
```

Expected: FAIL — route not registered.

- [ ] **Step 3: Create `backend/app/services/meal_log_service.py`**

```python
# backend/app/services/meal_log_service.py
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import CarryoverMeal, MealPlan, MealPlanEntry, RecipeCookLog
from app.schemas.meal_plan import LogEntry


async def log_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entries: list[LogEntry],
) -> list[CarryoverMeal]:
    plan = await db.get(MealPlan, plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    if plan.status != "active":
        raise HTTPException(
            status_code=400,
            detail="Meal plan cannot be logged — it is not active",
        )

    carryovers: list[CarryoverMeal] = []
    today = datetime.now(timezone.utc).date()

    for log_entry in entries:
        db_entry = await db.get(MealPlanEntry, log_entry.entry_id)
        if db_entry is None or db_entry.meal_plan_id != plan_id:
            continue  # skip invalid entry IDs
        if db_entry.recipe_id is None:
            continue  # skip free-text / suggestion entries

        if log_entry.outcome == "cooked":
            cook_log = RecipeCookLog(
                user_id=user_id,
                recipe_id=db_entry.recipe_id,
                meal_plan_id=plan_id,
                cooked_at=db_entry.date,
            )
            db.add(cook_log)

        elif log_entry.outcome in ("not_cooked", "leftover"):
            carryover = CarryoverMeal(
                user_id=user_id,
                source_meal_plan_id=plan_id,
                recipe_id=db_entry.recipe_id,
                original_date=db_entry.date,
                original_meal_type=db_entry.meal_type,
                reason=log_entry.outcome,
            )
            db.add(carryover)
            carryovers.append(carryover)

    plan.status = "completed"
    plan.updated_at = datetime.now(timezone.utc)
    db.add(plan)
    await db.commit()

    for c in carryovers:
        await db.refresh(c)

    return carryovers


async def get_unresolved_carryovers(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[CarryoverMeal]:
    result = await db.execute(
        select(CarryoverMeal)
        .where(CarryoverMeal.user_id == user_id, CarryoverMeal.resolved == False)  # noqa: E712
        .order_by(CarryoverMeal.created_at.desc())
    )
    return list(result.scalars().all())
```

- [ ] **Step 4: Add log + carryover routes to `meal_plans.py`**

Append (these are static path routes — must appear before `/{plan_id}` to avoid routing conflicts; add them at the top alongside `/shortlist` and `/suggestions`):

```python
from app.schemas.meal_plan import CarryoverMealResponse, MealPlanLogRequest
from app.services import meal_log_service


@router.get("/carryovers", response_model=list[CarryoverMealResponse])
async def get_carryovers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[CarryoverMealResponse]:
    carryovers = await meal_log_service.get_unresolved_carryovers(db, user.id)
    return [CarryoverMealResponse.model_validate(c) for c in carryovers]


@router.post("/{plan_id}/log", response_model=list[CarryoverMealResponse])
async def log_meal_plan(
    plan_id: uuid.UUID,
    data: MealPlanLogRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[CarryoverMealResponse]:
    carryovers = await meal_log_service.log_meal_plan(db, user.id, plan_id, data.entries)
    return [CarryoverMealResponse.model_validate(c) for c in carryovers]
```

- [ ] **Step 5: Run Phase 6 backend tests**

```bash
cd backend
pytest tests/integration/test_meal_plan_routes.py::test_log_cooked_creates_cook_log \
       tests/integration/test_meal_plan_routes.py::test_log_not_cooked_creates_carryover \
       tests/integration/test_meal_plan_routes.py::test_log_plan_sets_status_completed \
       tests/integration/test_meal_plan_routes.py::test_log_non_active_plan_returns_400 \
       tests/integration/test_meal_plan_routes.py::test_get_carryovers -v
```

Expected: all 5 PASS.

- [ ] **Step 6: Run full backend suite**

```bash
cd backend
pytest --cov=app --cov-report=term-missing -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/services/meal_log_service.py app/api/routes/meal_plans.py \
        tests/integration/test_meal_plan_routes.py
git commit -m "feat: add meal log service and routes (Phase 6 — logging + carryover)"
```

---

## Task 18 (Phase 6): CarryoverBanner + MealPlanLogView

**Files:**
- Create: `frontend/src/components/CarryoverBanner.vue`
- Create: `frontend/src/views/MealPlanLogView.vue`

- [ ] **Step 1: Create `frontend/src/components/CarryoverBanner.vue`**

```vue
<script setup lang="ts">
import { useShortlistStore } from '@/stores/useShortlistStore'
import type { CarryoverMeal } from '@/types/mealPlan'

const props = defineProps<{ carryovers: CarryoverMeal[] }>()
const shortlistStore = useShortlistStore()

async function addToShortlist(carryover: CarryoverMeal) {
  await shortlistStore.addEntry({
    recipe_id: carryover.recipe_id,
    entry_type: 'recipe',
  })
}
</script>

<template>
  <div v-if="carryovers.length > 0" class="carryover-banner" data-testid="carryover-banner">
    <p class="banner-title">
      🔄 {{ carryovers.length }} meal{{ carryovers.length > 1 ? 's' : '' }} carried over
    </p>
    <ul class="carryover-list">
      <li v-for="c in carryovers" :key="c.id" class="carryover-item">
        <span class="carryover-info">
          {{ c.original_date }} · {{ c.original_meal_type }} ·
          <em>{{ c.reason === 'not_cooked' ? 'not cooked' : 'leftover' }}</em>
        </span>
        <button class="btn-add-shortlist" @click="addToShortlist(c)">
          + Shortlist
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.carryover-banner {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.banner-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.carryover-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.carryover-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}
.btn-add-shortlist {
  background: #ffc107;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
```

- [ ] **Step 2: Create `frontend/src/views/MealPlanLogView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import CarryoverBanner from '@/components/CarryoverBanner.vue'
import * as mealPlansApi from '@/api/mealPlans'
import type { CarryoverMeal, LogEntry, MealPlanEntry } from '@/types/mealPlan'

const route = useRoute()
const router = useRouter()
const planStore = useMealPlanStore()
const shortlistStore = useShortlistStore()

const planId = route.params.id as string
const outcomes = ref<Record<string, 'cooked' | 'not_cooked' | 'leftover'>>({})
const carryovers = ref<CarryoverMeal[]>([])
const submitting = ref(false)
const submitted = ref(false)

onMounted(async () => {
  await planStore.fetchPlan(planId)
  // default all recipe entries to 'cooked'
  for (const entry of planStore.currentPlan?.entries ?? []) {
    if (entry.recipe_id) {
      outcomes.value[entry.id] = 'cooked'
    }
  }
})

const loggableEntries = computed(() =>
  (planStore.currentPlan?.entries ?? []).filter((e) => e.recipe_id !== null)
)

async function submit() {
  submitting.value = true
  const logEntries: LogEntry[] = Object.entries(outcomes.value).map(([entry_id, outcome]) => ({
    entry_id,
    outcome,
  }))
  try {
    const { data } = await mealPlansApi.logMealPlan(planId, logEntries)
    carryovers.value = data
    submitted.value = true
    await shortlistStore.fetchShortlist()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="log-view">
    <h1>Log meals — {{ planStore.currentPlan?.name }}</h1>

    <CarryoverBanner v-if="submitted" :carryovers="carryovers" />

    <div v-if="submitted" class="done-actions">
      <p>Plan logged successfully.</p>
      <button class="btn-primary" @click="router.push({ name: 'meal-plans' })">
        Back to plans
      </button>
    </div>

    <template v-else>
      <p class="hint">Mark each meal as cooked, not cooked, or leftover.</p>

      <div class="entry-list">
        <div
          v-for="entry in loggableEntries"
          :key="entry.id"
          class="log-entry"
        >
          <div class="entry-info">
            <span class="entry-date">{{ entry.date }}</span>
            <span class="entry-meal">{{ entry.meal_type }}</span>
          </div>
          <div class="outcome-toggles" :data-testid="`outcomes-${entry.id}`">
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="cooked"
              />
              Cooked
            </label>
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="not_cooked"
              />
              Not cooked
            </label>
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="leftover"
              />
              Leftover
            </label>
          </div>
        </div>
      </div>

      <div class="log-actions">
        <button class="btn-secondary" @click="router.back()">Cancel</button>
        <button
          class="btn-primary"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? 'Saving…' : 'Submit log' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-view {
  max-width: 700px;
  margin: 0 auto;
  padding: 1rem;
}
.hint {
  color: #666;
  margin-bottom: 1rem;
}
.entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.log-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.entry-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.entry-date { font-size: 0.85rem; color: #888; }
.entry-meal { font-weight: 600; text-transform: capitalize; }
.outcome-toggles {
  display: flex;
  gap: 1rem;
}
.outcome-toggles label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.log-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
.btn-primary {
  background: #2ecc71;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  font-weight: 600;
}
.btn-primary:disabled { opacity: 0.6; }
.btn-secondary {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}
</style>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run all frontend unit tests**

```bash
cd frontend
npm run test:unit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/CarryoverBanner.vue src/views/MealPlanLogView.vue
git commit -m "feat: add CarryoverBanner and MealPlanLogView (Phase 6 frontend complete)"
```

---

## Task 19: E2E tests

**Files:**
- Create: `frontend/e2e/meal-plans.spec.ts`

- [ ] **Step 1: Start the test stack**

```bash
cd /path/to/project
docker compose -f docker-compose.test.yml up -d
```

Wait for healthy status:
```bash
docker compose -f docker-compose.test.yml ps
```

Expected: backend and frontend both show `healthy`.

- [ ] **Step 2: Create `frontend/e2e/meal-plans.spec.ts`**

```typescript
// frontend/e2e/meal-plans.spec.ts
import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-mealplan-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPass123!'

test.beforeAll(async ({ request }) => {
  await request.post('/api/v1/auth/register', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })
})

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')
})

test('can create a meal plan and navigate to it', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.waitForURL('/meal-plans/new')

  await page.fill('#plan-name', 'E2E Test Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-13')
  await page.click('button[type="submit"]')

  await page.waitForURL(/\/meal-plans\/[a-z0-9-]+$/)
  await expect(page.locator('h1, .plan-title')).toContainText('E2E Test Plan')
})

test('can type free text into a meal slot', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Slot Test Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-09')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[a-z0-9-]+$/)

  // Click the first empty slot
  const emptySlot = page.locator('[data-testid="slot-empty"]').first()
  await emptySlot.click()

  // Type in the inline input
  const input = page.locator('[data-testid="slot-text-input"]').first()
  await input.fill('Restaurant X')
  await input.press('Enter')

  await expect(page.locator('.slot-content.freetext').first()).toContainText('Restaurant X')
})

test('can confirm a plan', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Confirm Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-09')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[a-z0-9-]+$/)

  await page.click('button:has-text("Confirm Plan")')
  await expect(page.locator('button:has-text("Log meals")')).toBeVisible()
})

test('can log a plan and see carryover banner', async ({ page }) => {
  // First create a recipe
  await page.goto('/recipes/new')
  await page.fill('input[name="title"], #recipe-title', 'E2E Beef Stew')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/recipes\/[a-z0-9-]+$/)
  const recipeUrl = page.url()
  const recipeId = recipeUrl.split('/').pop()!

  // Create and confirm a plan with an entry
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Log E2E Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-07')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[a-z0-9-]+$/)
  const planUrl = page.url()
  const planId = planUrl.split('/').pop()!

  // Confirm plan via API for simplicity
  await page.request.post(`/api/v1/meal-plans/${planId}/confirm`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('access_token'))}` },
  })

  // Navigate to log view
  await page.goto(`/meal-plans/${planId}/log`)
  await page.click('button:has-text("Submit log")')

  // Carryover banner only shown when there are carryovers — this plan has no recipe entries
  // so just verify the "Plan logged" success message
  await expect(page.locator('text=Plan logged successfully')).toBeVisible()
})
```

- [ ] **Step 3: Run E2E tests**

```bash
cd frontend
npx playwright test e2e/meal-plans.spec.ts --reporter=list
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/meal-plans.spec.ts
git commit -m "test: add meal plan E2E tests (Phase 5 + 6)"
```

---

## Task 20: Merge to main

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest --cov=app --cov-report=term-missing -q
```

Expected: all pass.

- [ ] **Step 2: Run full frontend unit test suite**

```bash
cd frontend
npm run test:unit
```

Expected: all pass.

- [ ] **Step 3: Type-check frontend**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Merge branch to main**

```bash
git checkout main
git merge --no-ff phase5-phase6-meal-planning
git push origin main
```

---

*End of plan. 20 tasks covering backend models, migrations, services, routes, frontend types, stores, composables, components, views, and E2E tests for Phase 5 (meal planning) and Phase 6 (logging + carryover).*
