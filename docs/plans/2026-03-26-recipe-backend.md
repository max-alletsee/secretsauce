# Recipe CRUD & Versioning Backend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Recipe and RecipeVersion backend — models, schemas, service, and routes — with full CRUD, copy-on-write versioning, cursor-based pagination, and owner/visibility access control.

**Architecture:** Two SQLModel tables (`recipes`, `recipe_versions`) with a circular FK (recipes.current_version_id → recipe_versions, recipe_versions.recipe_id → recipes) broken via `use_alter=True`. All business logic lives in `app/services/recipe_service.py`; route handlers are thin wrappers. Cursor pagination uses base64-encoded `{created_at, id}` pairs for stable ordering. Services raise `HTTPException` directly, consistent with the existing auth code pattern.

**Tech Stack:** FastAPI, SQLModel 0.0.37, async SQLAlchemy + asyncpg, Alembic, Pydantic v2, pytest-asyncio `asyncio_mode="auto"`, httpx `AsyncClient` for integration tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/app/models/recipe.py` | `Recipe` + `RecipeVersion` SQLModel table definitions |
| Modify | `backend/alembic/env.py` | Import recipe models so Alembic sees them |
| Create | `backend/alembic/versions/<hash>_create_recipes_tables.py` | Migration: create both tables + deferred FK |
| Create | `backend/app/schemas/recipe.py` | `Ingredient`, `Step`, `RecipeSource`, `RecipeCreate`, `RecipeUpdate`, `RecipeVersionResponse`, `RecipeResponse`, `PaginatedRecipeResponse` |
| No change | `backend/app/api/deps.py` | Not modified — routes import `current_active_user` directly from `app.core.security` to avoid a circular import (`security.py` already imports `get_db` from `deps.py`) |
| Create | `backend/app/services/recipe_service.py` | All 7 service functions: create, get, list, update, delete, get_versions, restore_version |
| Create | `backend/app/api/routes/recipes.py` | 7 route handlers |
| Modify | `backend/app/main.py` | Include recipes router |
| Modify | `backend/tests/conftest.py` | Import recipe models so test DB creates the tables |
| Create | `backend/tests/integration/test_recipe_routes.py` | Full integration test suite |

---

## Chunk 1: Models & Migration

### Task 1: Recipe + RecipeVersion SQLModel models

**Files:**
- Create: `backend/app/models/recipe.py`
- Modify: `backend/alembic/env.py`
- Modify: `backend/tests/conftest.py`

**Design notes:**
- `servings` is stored as non-nullable `int` with default `2`. This matches `User.default_servings` and `RecipeCreate.servings` — the project default throughout is 2 servings. Recipe content without a serving count defaults to 2, not null.
- `total_time_minutes` is **not stored** — it's a computed display value (prep + waiting + cook). Do not add it as a DB column.
- `updated_at` uses SQLAlchemy's `onupdate` hook as a fallback, but **async sessions using `session.execute(update(...))`  do not fire client-side `onupdate`**. The service layer must always explicitly set `recipe.updated_at = datetime.now(timezone.utc)` on every update. The `onupdate` column default is a safety net for direct SQL updates only.
- Performance indexes: compound index on `(created_at DESC, id)` on `recipes` (for cursor pagination), and on `(recipe_id, version_number DESC)` on `recipe_versions` (for version listing). These cannot be expressed with SQLModel field `index=True` — they go in `__table_args__`.

- [ ] **Step 1: Write the model field tests**

Create `backend/tests/unit/test_recipe_models.py`:

```python
# backend/tests/unit/test_recipe_models.py
import uuid

from app.models.recipe import Recipe, RecipeVersion


def test_recipe_has_required_fields():
    fields = set(Recipe.model_fields.keys())
    assert {"id", "owner_id", "current_version_id", "visibility", "created_at", "updated_at"} <= fields


def test_recipe_version_has_required_fields():
    fields = set(RecipeVersion.model_fields.keys())
    assert {
        "id", "recipe_id", "version_number", "title", "description",
        "ingredients", "steps", "servings", "prep_time_minutes",
        "waiting_time_minutes", "cook_time_minutes", "tags",
        "recipe_source", "created_at", "created_by",
    } <= fields


def test_total_time_minutes_is_not_a_db_column():
    # total_time_minutes is computed, never stored — guard against accidental addition
    assert "total_time_minutes" not in Recipe.model_fields
    assert "total_time_minutes" not in RecipeVersion.model_fields


def test_recipe_defaults():
    recipe = Recipe(owner_id=uuid.uuid4())
    assert recipe.visibility == "private"
    assert recipe.current_version_id is None


def test_recipe_version_defaults():
    version = RecipeVersion(
        recipe_id=uuid.uuid4(),
        title="Test",
        created_by=uuid.uuid4(),
    )
    assert version.version_number == 1
    assert version.ingredients == []
    assert version.steps == []
    assert version.tags == []
    assert version.servings == 2  # default servings matches User.default_servings and RecipeCreate default
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_recipe_models.py -v
```

Expected: `ERROR — ModuleNotFoundError: No module named 'app.models.recipe'`

- [ ] **Step 3: Write `backend/app/models/recipe.py`**

```python
# backend/app/models/recipe.py
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class Recipe(SQLModel, table=True):
    __tablename__ = "recipes"
    __table_args__ = (
        # Compound index for cursor-based pagination (ORDER BY created_at DESC, id DESC)
        Index("ix_recipes_created_at_id", "created_at", "id"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", name="fk_recipes_owner_id"),
            nullable=False,
            index=True,
        )
    )
    # use_alter=True breaks the circular FK between recipes ↔ recipe_versions.
    # Alembic emits this as a separate CREATE CONSTRAINT after both tables exist.
    # NOTE: async sessions using session.execute(update(...)) do NOT fire onupdate.
    # Always set updated_at explicitly in service layer on every write.
    current_version_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            sa.Uuid(),
            ForeignKey(
                "recipe_versions.id",
                use_alter=True,
                name="fk_recipes_current_version_id",
            ),
            nullable=True,
        ),
    )
    visibility: Literal["private", "shared"] = Field(
        default="private",
        sa_column=Column(String(10), nullable=False, server_default="private"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            onupdate=lambda: datetime.now(timezone.utc),
        ),
    )


class RecipeVersion(SQLModel, table=True):
    __tablename__ = "recipe_versions"
    __table_args__ = (
        # Compound index for efficient version listing (ORDER BY version_number DESC per recipe)
        Index("ix_recipe_versions_recipe_id_version_number", "recipe_id", "version_number"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("recipes.id", name="fk_recipe_versions_recipe_id"),
            nullable=False,
        )
    )
    version_number: int = Field(default=1)
    title: str = Field(max_length=500)
    description: str | None = Field(default=None)
    ingredients: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    steps: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    servings: int = Field(default=2)
    prep_time_minutes: int | None = Field(default=None)
    waiting_time_minutes: int | None = Field(default=None)
    cook_time_minutes: int | None = Field(default=None)
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    recipe_source: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    created_by: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", name="fk_recipe_versions_created_by"),
            nullable=False,
        )
    )
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_recipe_models.py -v
```

Expected: 5 PASSED

- [ ] **Step 5: Register recipe models in `backend/alembic/env.py` and `backend/tests/conftest.py`**

In `backend/alembic/env.py`, add after the existing user import:

```python
from app.models import recipe  # noqa: F401
```

In `backend/tests/conftest.py`, add after the existing user import:

```python
from app.models import recipe as _recipe_models  # noqa: F401 — registers Recipe/RecipeVersion in SQLModel.metadata
```

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/models/recipe.py alembic/env.py tests/conftest.py tests/unit/test_recipe_models.py
git commit -m "feat: add Recipe and RecipeVersion SQLModel table definitions"
```

---

### Task 2: Alembic migration for recipes + recipe_versions

**Files:**
- Create: `backend/alembic/versions/<hash>_create_recipes_tables.py` (generated)

**Note:** The circular FK between `recipes` and `recipe_versions` means the migration correctness cannot be verified from Python model tests alone — it must be verified by actually running `alembic upgrade head` against a live database and checking for FK constraint errors. The integration tests in Chunk 3 will serve as the automated proof.

- [ ] **Step 1: Generate the migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "create recipes tables"
```

Expected output: `Generating .../alembic/versions/<hash>_create_recipes_tables.py`

- [ ] **Step 2: Inspect and verify the generated migration**

Open the generated file. Verify it contains:
1. `op.create_table('recipes', ...)` — `current_version_id` column present but **no inline FK** for it
2. `op.create_table('recipe_versions', ...)` — with FK to `recipes`
3. `op.create_foreign_key('fk_recipes_current_version_id', ...)` — as a **separate call** after both tables exist
4. Compound indexes: `ix_recipes_created_at_id` and `ix_recipe_versions_recipe_id_version_number`

The critical section is that the circular FK is emitted as a **separate** `create_foreign_key` call *after* both tables exist, not inline. If Alembic's autogenerate places `current_version_id` as an inline FK in the `create_table` for `recipes`, manually restructure it to match this pattern:

```python
def upgrade() -> None:
    op.create_table('recipes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('current_version_id', sa.Uuid(), nullable=True),  # no inline FK here
        sa.Column('visibility', sqlmodel.sql.sqltypes.AutoString(length=10), server_default='private', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name='fk_recipes_owner_id'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recipes_owner_id', 'recipes', ['owner_id'])
    op.create_index('ix_recipes_created_at_id', 'recipes', ['created_at', 'id'])
    op.create_table('recipe_versions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Uuid(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('ingredients', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('servings', sa.Integer(), nullable=False),
        sa.Column('prep_time_minutes', sa.Integer(), nullable=True),
        sa.Column('waiting_time_minutes', sa.Integer(), nullable=True),
        sa.Column('cook_time_minutes', sa.Integer(), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('recipe_source', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id'], name='fk_recipe_versions_recipe_id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_recipe_versions_created_by'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recipe_versions_recipe_id_version_number', 'recipe_versions', ['recipe_id', 'version_number'])
    # Deferred circular FK — must come after both tables exist
    op.create_foreign_key(
        'fk_recipes_current_version_id',
        'recipes', 'recipe_versions',
        ['current_version_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_recipes_current_version_id', 'recipes', type_='foreignkey')
    op.drop_index('ix_recipe_versions_recipe_id_version_number', table_name='recipe_versions')
    op.drop_table('recipe_versions')
    op.drop_index('ix_recipes_created_at_id', table_name='recipes')
    op.drop_index('ix_recipes_owner_id', table_name='recipes')
    op.drop_table('recipes')
```

- [ ] **Step 3: Apply the migration**

```bash
cd backend && uv run alembic upgrade head
```

Expected: No errors. Apply to the test DB too:

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://secretsauce:secretsauce@localhost:5432/secretsauce_test uv run alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add alembic/versions/
git commit -m "feat: add Alembic migration for recipes and recipe_versions tables"
```

---

## Chunk 2: Schemas + Service

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/recipe.py`

- [ ] **Step 1: Write schema tests**

Create `backend/tests/unit/test_recipe_schemas.py`:

```python
# backend/tests/unit/test_recipe_schemas.py
import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.recipe import (
    Ingredient,
    RecipeCreate,
    RecipeResponse,
    RecipeUpdate,
    RecipeVersionResponse,
    Step,
)


def test_ingredient_requires_name():
    with pytest.raises(ValidationError):
        Ingredient(quantity="200")


def test_ingredient_unit_optional():
    i = Ingredient(name="salt", quantity="1 pinch")
    assert i.unit is None


def test_step_requires_order_and_instruction():
    with pytest.raises(ValidationError):
        Step(order=1)  # missing instruction


def test_recipe_create_requires_title():
    with pytest.raises(ValidationError):
        RecipeCreate(description="no title")


def test_recipe_create_title_cannot_be_empty():
    with pytest.raises(ValidationError):
        RecipeCreate(title="")


def test_recipe_create_defaults():
    r = RecipeCreate(title="Pasta")
    assert r.visibility == "private"
    assert r.ingredients == []
    assert r.steps == []
    assert r.servings == 2


def test_recipe_update_all_optional():
    u = RecipeUpdate()  # no fields required
    assert u.title is None


def test_recipe_update_servings_must_be_positive():
    with pytest.raises(ValidationError):
        RecipeUpdate(servings=0)


def test_recipe_version_response_total_time_minutes_computed():
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    rv = RecipeVersionResponse(
        id=_uid,
        recipe_id=_uid,
        version_number=1,
        title="Test",
        description=None,
        ingredients=[],
        steps=[],
        servings=2,
        prep_time_minutes=10,
        waiting_time_minutes=5,
        cook_time_minutes=20,
        tags=[],
        recipe_source=None,
        created_at=_now,
        created_by=_uid,
    )
    assert rv.total_time_minutes == 35  # 10 + 5 + 20


def test_recipe_version_response_total_time_minutes_none_when_all_times_none():
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    rv = RecipeVersionResponse(
        id=_uid,
        recipe_id=_uid,
        version_number=1,
        title="Test",
        description=None,
        ingredients=[],
        steps=[],
        servings=2,
        prep_time_minutes=None,
        waiting_time_minutes=None,
        cook_time_minutes=None,
        tags=[],
        recipe_source=None,
        created_at=_now,
        created_by=_uid,
    )
    assert rv.total_time_minutes is None


def test_recipe_response_has_current_version():
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    version = RecipeVersionResponse(
        id=_uid,
        recipe_id=_uid,
        version_number=1,
        title="Test",
        description=None,
        ingredients=[],
        steps=[],
        servings=2,
        prep_time_minutes=None,
        waiting_time_minutes=None,
        cook_time_minutes=None,
        tags=[],
        recipe_source=None,
        created_at=_now,
        created_by=_uid,
    )
    r = RecipeResponse(
        id=_uid,
        owner_id=_uid,
        visibility="private",
        current_version=version,
        created_at=_now,
        updated_at=_now,
    )
    assert r.current_version.title == "Test"


def test_jsonb_dicts_coerce_to_ingredient_models():
    """JSONB data from Postgres comes back as plain dicts — Pydantic must coerce them."""
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    rv = RecipeVersionResponse(
        id=_uid,
        recipe_id=_uid,
        version_number=1,
        title="Test",
        description=None,
        ingredients=[{"name": "salt", "quantity": "1 tsp", "unit": None}],
        steps=[{"order": 1, "instruction": "Mix"}],
        servings=2,
        prep_time_minutes=None,
        waiting_time_minutes=None,
        cook_time_minutes=None,
        tags=[],
        recipe_source=None,
        created_at=_now,
        created_by=_uid,
    )
    assert isinstance(rv.ingredients[0], Ingredient)
    assert rv.ingredients[0].name == "salt"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_recipe_schemas.py -v
```

Expected: `ERROR — ModuleNotFoundError: No module named 'app.schemas.recipe'`

- [ ] **Step 3: Write `backend/app/schemas/recipe.py`**

```python
# backend/app/schemas/recipe.py
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field


class Ingredient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    quantity: str
    unit: str | None = None


class Step(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order: int
    instruction: str


class RecipeSource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: Literal["url", "book"]
    url: str | None = None
    book_title: str | None = None
    page: int | None = None


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    ingredients: list[Ingredient] = Field(default_factory=list)
    steps: list[Step] = Field(default_factory=list)
    servings: int = Field(default=2, ge=1)
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] = Field(default_factory=list)
    recipe_source: RecipeSource | None = None
    visibility: Literal["private", "shared"] = "private"


class RecipeUpdate(BaseModel):
    # MVP limitation: None always means "omit this field" — you cannot clear a nullable
    # time field (prep/waiting/cook/description) back to null via this endpoint.
    # The service uses `field if field is not None else current_version.field` for all fields.
    # Fix in a future iteration using model_fields_set to distinguish omitted vs explicit null.
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    ingredients: list[Ingredient] | None = None
    steps: list[Step] | None = None
    servings: int | None = Field(default=None, ge=1)
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] | None = None
    recipe_source: RecipeSource | None = None
    visibility: Literal["private", "shared"] | None = None


class RecipeVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipe_id: uuid.UUID
    version_number: int
    title: str
    description: str | None
    ingredients: list[Ingredient]
    steps: list[Step]
    servings: int
    prep_time_minutes: int | None
    waiting_time_minutes: int | None
    cook_time_minutes: int | None
    tags: list[str]
    recipe_source: RecipeSource | None
    created_at: datetime
    created_by: uuid.UUID

    @computed_field  # type: ignore[misc]
    @property
    def total_time_minutes(self) -> int | None:
        times = [
            t for t in [self.prep_time_minutes, self.waiting_time_minutes, self.cook_time_minutes]
            if t is not None
        ]
        return sum(times) if times else None


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    visibility: Literal["private", "shared"]
    current_version: RecipeVersionResponse
    created_at: datetime
    updated_at: datetime


class PaginatedRecipeResponse(BaseModel):
    items: list[RecipeResponse]
    next_cursor: str | None
    has_more: bool
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_recipe_schemas.py -v
```

Expected: 12 PASSED

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/schemas/recipe.py tests/unit/test_recipe_schemas.py
git commit -m "feat: add Recipe Pydantic schemas (create, update, response, computed total_time)"
```

---

### Task 4: Recipe service

**Files:**
- Create: `backend/app/services/recipe_service.py`

The service raises `HTTPException` directly (consistent with the auth routes pattern), so route handlers stay thin.

**Import pattern for auth dependency:** `current_active_user` is defined in `app.core.security`. Do **not** re-export it from `deps.py` — that would create a circular import (`deps.py` → `security.py` → `deps.py`). Route files import it directly: `from app.core.security import current_active_user`.

- [ ] **Step 1: Write service unit tests**

Create `backend/tests/unit/test_recipe_service.py`:

```python
# backend/tests/unit/test_recipe_service.py
"""
Unit-style tests for recipe_service helper functions (cursor encoding, etc.)
These do not hit the database — they test pure logic.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.services.recipe_service import _decode_cursor, _encode_cursor
from app.models.recipe import Recipe


def _make_recipe(**kwargs) -> Recipe:
    defaults = dict(
        owner_id=uuid.uuid4(),
        visibility="private",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Recipe(**defaults)


def test_cursor_roundtrip():
    recipe = _make_recipe()
    cursor = _encode_cursor(recipe)
    decoded = _decode_cursor(cursor)
    assert decoded["id"] == recipe.id
    assert decoded["created_at"].tzinfo is not None  # timezone must survive round-trip for correct SQL comparisons
    assert decoded["created_at"].replace(tzinfo=None) == recipe.created_at.replace(tzinfo=None)


def test_decode_invalid_cursor_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor("not-valid-base64!!!")
    assert exc_info.value.status_code == 400


def test_decode_garbage_base64_raises_400():
    import base64
    bad = base64.urlsafe_b64encode(b"not json").decode()
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor(bad)
    assert exc_info.value.status_code == 400
```

- [ ] **Step 3: Run unit tests to confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_recipe_service.py -v
```

Expected: `ERROR — ModuleNotFoundError: No module named 'app.services.recipe_service'`

- [ ] **Step 4: Write `backend/app/services/recipe_service.py`**

```python
# backend/app/services/recipe_service.py
import base64
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe import Recipe, RecipeVersion
from app.schemas.recipe import RecipeCreate, RecipeUpdate


# ── Cursor helpers ────────────────────────────────────────────────────────────

def _encode_cursor(recipe: Recipe) -> str:
    data = {"created_at": recipe.created_at.isoformat(), "id": str(recipe.id)}
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def _decode_cursor(cursor: str) -> dict:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        data["id"] = uuid.UUID(data["id"])
        return data
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")


# ── Service functions ─────────────────────────────────────────────────────────

async def create_recipe(
    db: AsyncSession,
    owner_id: uuid.UUID,
    data: RecipeCreate,
) -> tuple[Recipe, RecipeVersion]:
    """Create a new Recipe with its first RecipeVersion in a single transaction."""
    recipe = Recipe(owner_id=owner_id, visibility=data.visibility)
    db.add(recipe)
    await db.flush()  # assign recipe.id without committing

    version = RecipeVersion(
        recipe_id=recipe.id,
        version_number=1,
        title=data.title,
        description=data.description,
        ingredients=[i.model_dump() for i in data.ingredients],
        steps=[s.model_dump() for s in data.steps],
        servings=data.servings,
        prep_time_minutes=data.prep_time_minutes,
        waiting_time_minutes=data.waiting_time_minutes,
        cook_time_minutes=data.cook_time_minutes,
        tags=data.tags,
        recipe_source=data.recipe_source.model_dump() if data.recipe_source else None,
        created_by=owner_id,
    )
    db.add(version)
    await db.flush()  # assign version.id

    recipe.current_version_id = version.id
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(version)
    return recipe, version


async def get_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> tuple[Recipe, RecipeVersion]:
    """Fetch a recipe with its current version. Returns 404 if not found or not accessible."""
    result = await db.execute(
        select(Recipe, RecipeVersion)
        .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
        .where(Recipe.id == recipe_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe, version = row
    if recipe.visibility == "private" and recipe.owner_id != current_user_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe, version


async def list_recipes(
    db: AsyncSession,
    current_user_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[tuple[Recipe, RecipeVersion]], str | None, bool]:
    """
    List recipes visible to current_user (own + shared), newest first.
    Returns (items, next_cursor, has_more). Items are (Recipe, RecipeVersion) tuples.
    """
    query = (
        select(Recipe, RecipeVersion)
        .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
        .where(
            (Recipe.owner_id == current_user_id) | (Recipe.visibility == "shared")
        )
        .order_by(Recipe.created_at.desc(), Recipe.id.desc())
        .limit(limit + 1)
    )

    if cursor:
        cursor_data = _decode_cursor(cursor)
        query = query.where(
            (Recipe.created_at < cursor_data["created_at"])
            | (
                (Recipe.created_at == cursor_data["created_at"])
                & (Recipe.id < cursor_data["id"])
            )
        )

    result = await db.execute(query)
    rows = result.all()

    has_more = len(rows) > limit
    items = list(rows[:limit])
    next_cursor = _encode_cursor(items[-1][0]) if has_more else None
    return items, next_cursor, has_more


async def update_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
    data: RecipeUpdate,
) -> tuple[Recipe, RecipeVersion]:
    """Copy-on-write update: creates a new RecipeVersion and points current_version_id at it."""
    recipe, current_version = await get_recipe(db, recipe_id, current_user_id)
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    count_result = await db.execute(
        select(func.count()).where(RecipeVersion.recipe_id == recipe_id)
    )
    version_count = count_result.scalar_one()

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=version_count + 1,
        title=data.title if data.title is not None else current_version.title,
        description=data.description if data.description is not None else current_version.description,
        ingredients=(
            [i.model_dump() for i in data.ingredients]
            if data.ingredients is not None
            else current_version.ingredients
        ),
        steps=(
            [s.model_dump() for s in data.steps]
            if data.steps is not None
            else current_version.steps
        ),
        servings=data.servings if data.servings is not None else current_version.servings,
        prep_time_minutes=(
            data.prep_time_minutes
            if data.prep_time_minutes is not None
            else current_version.prep_time_minutes
        ),
        waiting_time_minutes=(
            data.waiting_time_minutes
            if data.waiting_time_minutes is not None
            else current_version.waiting_time_minutes
        ),
        cook_time_minutes=(
            data.cook_time_minutes
            if data.cook_time_minutes is not None
            else current_version.cook_time_minutes
        ),
        tags=data.tags if data.tags is not None else current_version.tags,
        recipe_source=(
            data.recipe_source.model_dump()
            if data.recipe_source is not None
            else current_version.recipe_source
        ),
        created_by=current_user_id,
    )
    db.add(new_version)
    await db.flush()

    recipe.current_version_id = new_version.id
    if data.visibility is not None:
        recipe.visibility = data.visibility
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(new_version)
    return recipe, new_version


async def delete_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> None:
    """Delete a recipe and all its versions. Owner only."""
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    # Nullify current_version_id first to break the circular FK before deleting versions
    recipe.current_version_id = None
    db.add(recipe)
    await db.flush()

    versions_result = await db.execute(
        select(RecipeVersion).where(RecipeVersion.recipe_id == recipe_id)
    )
    for version in versions_result.scalars().all():
        await db.delete(version)
    await db.flush()

    await db.delete(recipe)
    await db.commit()


async def get_versions(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> list[RecipeVersion]:
    """Return all versions of a recipe, newest first. Respects visibility."""
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.visibility == "private" and recipe.owner_id != current_user_id:
        raise HTTPException(status_code=404, detail="Recipe not found")

    versions_result = await db.execute(
        select(RecipeVersion)
        .where(RecipeVersion.recipe_id == recipe_id)
        .order_by(RecipeVersion.version_number.desc())
    )
    return list(versions_result.scalars().all())


async def restore_version(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> tuple[Recipe, RecipeVersion]:
    """
    Create a new RecipeVersion copying the content of the target version,
    then set it as current. Append-only: old versions are never mutated.
    Owner only.
    """
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    target_result = await db.execute(
        select(RecipeVersion).where(
            RecipeVersion.id == version_id,
            RecipeVersion.recipe_id == recipe_id,
        )
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Version not found")

    count_result = await db.execute(
        select(func.count()).where(RecipeVersion.recipe_id == recipe_id)
    )
    version_count = count_result.scalar_one()

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=version_count + 1,
        title=target.title,
        description=target.description,
        ingredients=target.ingredients,
        steps=target.steps,
        servings=target.servings,
        prep_time_minutes=target.prep_time_minutes,
        waiting_time_minutes=target.waiting_time_minutes,
        cook_time_minutes=target.cook_time_minutes,
        tags=target.tags,
        recipe_source=target.recipe_source,
        created_by=current_user_id,
    )
    db.add(new_version)
    await db.flush()

    recipe.current_version_id = new_version.id
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(new_version)
    return recipe, new_version
```

- [ ] **Step 5: Run all service tests**

```bash
cd backend && uv run pytest tests/unit/test_recipe_service.py tests/unit/test_recipe_schemas.py tests/unit/test_recipe_models.py -v
```

Expected: all PASSED

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/recipe_service.py tests/unit/test_recipe_service.py
git commit -m "feat: add recipe service with CRUD, versioning, and cursor pagination"
```

---

## Chunk 3: Routes + Integration Tests

### Task 5: Recipe routes and main.py wiring

**Files:**
- Create: `backend/app/api/routes/recipes.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `backend/app/api/routes/recipes.py`**

Note: the update endpoint uses `PATCH` (partial update), not `PUT` (full replacement) — per the project's API convention that PUT = full update and PATCH = partial update. All `RecipeUpdate` fields are optional, which is correct partial-update semantics.

```python
# backend/app/api/routes/recipes.py
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.user import User
from app.schemas.recipe import (
    PaginatedRecipeResponse,
    RecipeCreate,
    RecipeResponse,
    RecipeUpdate,
    RecipeVersionResponse,
)
from app.services import recipe_service

router = APIRouter()


def _build_recipe_response(recipe, version) -> RecipeResponse:
    return RecipeResponse(
        id=recipe.id,
        owner_id=recipe.owner_id,
        visibility=recipe.visibility,
        current_version=RecipeVersionResponse.model_validate(version),
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


@router.get("", response_model=PaginatedRecipeResponse)
async def list_recipes(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> PaginatedRecipeResponse:
    items, next_cursor, has_more = await recipe_service.list_recipes(
        db, user.id, cursor=cursor, limit=limit
    )
    return PaginatedRecipeResponse(
        items=[_build_recipe_response(r, v) for r, v in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    data: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.create_recipe(db, user.id, data)
    return _build_recipe_response(recipe, version)


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.get_recipe(db, recipe_id, user.id)
    return _build_recipe_response(recipe, version)


@router.patch("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: uuid.UUID,
    data: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.update_recipe(db, recipe_id, user.id, data)
    return _build_recipe_response(recipe, version)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await recipe_service.delete_recipe(db, recipe_id, user.id)


@router.get("/{recipe_id}/versions", response_model=list[RecipeVersionResponse])
async def get_versions(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[RecipeVersionResponse]:
    versions = await recipe_service.get_versions(db, recipe_id, user.id)
    return [RecipeVersionResponse.model_validate(v) for v in versions]


@router.post("/{recipe_id}/versions/{version_id}/restore", response_model=RecipeResponse)
async def restore_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.restore_version(db, recipe_id, version_id, user.id)
    return _build_recipe_response(recipe, version)
```

- [ ] **Step 2: Add recipes router to `backend/app/main.py`**

Add these two lines:

```python
from app.api.routes import recipes  # add this import

# Add after existing router includes:
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["recipes"])
```

- [ ] **Step 3: Verify the app starts without errors**

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

Expected: Uvicorn starts. Check `http://localhost:8000/docs` — you should see `/api/v1/recipes` endpoints listed.
Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/api/routes/recipes.py app/main.py
git commit -m "feat: add recipe route handlers and wire into main app"
```

---

### Task 6: Integration tests

**Files:**
- Create: `backend/tests/integration/test_recipe_routes.py`

- [ ] **Step 1: Write the integration tests**

Create `backend/tests/integration/test_recipe_routes.py`:

```python
# backend/tests/integration/test_recipe_routes.py
from tests.conftest import unique_email


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> str:
    """Register a new unique user and return their access token."""
    email = unique_email("recipe")
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

async def test_create_recipe_requires_auth(client):
    r = await client.post("/api/v1/recipes", json={"title": "Test"})
    assert r.status_code == 401


async def test_create_recipe_minimal(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/recipes", json={"title": "Pasta"}, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert data["current_version"]["title"] == "Pasta"
    assert data["current_version"]["version_number"] == 1
    assert data["visibility"] == "private"
    assert "id" in data


async def test_create_recipe_full(client):
    token = await _auth_token(client)
    payload = {
        "title": "Carbonara",
        "description": "Classic Roman pasta",
        "ingredients": [
            {"name": "spaghetti", "quantity": "200", "unit": "g"},
            {"name": "guanciale", "quantity": "100", "unit": "g"},
        ],
        "steps": [
            {"order": 1, "instruction": "Cook pasta"},
            {"order": 2, "instruction": "Fry guanciale"},
        ],
        "servings": 2,
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "tags": ["italian", "dinner"],
        "visibility": "shared",
    }
    r = await client.post("/api/v1/recipes", json=payload, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert len(data["current_version"]["ingredients"]) == 2
    assert len(data["current_version"]["steps"]) == 2
    assert data["visibility"] == "shared"
    assert data["current_version"]["tags"] == ["italian", "dinner"]


async def test_create_recipe_missing_title_returns_422(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/recipes", json={"description": "no title"}, headers=_auth(token))
    assert r.status_code == 422


# ── Read ──────────────────────────────────────────────────────────────────────

async def test_get_recipe(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "Fetch Me"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["id"] == recipe_id


async def test_get_recipe_requires_auth(client):
    import uuid
    r = await client.get(f"/api/v1/recipes/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_get_recipe_not_found(client):
    token = await _auth_token(client)
    import uuid
    r = await client.get(f"/api/v1/recipes/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


async def test_get_private_recipe_as_other_user_returns_404(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Private", "visibility": "private"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 404


async def test_get_shared_recipe_as_other_user_returns_200(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Shared", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 200


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_recipes_requires_auth(client):
    r = await client.get("/api/v1/recipes")
    assert r.status_code == 401


async def test_list_only_returns_own_and_shared(client):
    token1 = await _auth_token(client)
    token2 = await _auth_token(client)
    private = await client.post("/api/v1/recipes", json={"title": "Owner1 Private"}, headers=_auth(token1))
    shared = await client.post(
        "/api/v1/recipes",
        json={"title": "Owner1 Shared", "visibility": "shared"},
        headers=_auth(token1),
    )
    private_id = private.json()["id"]
    shared_id = shared.json()["id"]

    # Use large limit to avoid pagination hiding results in a test DB with accumulated data
    r = await client.get("/api/v1/recipes?limit=100", headers=_auth(token2))
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert private_id not in ids   # private recipe from token1 is invisible to token2
    assert shared_id in ids        # shared recipe from token1 is visible to token2


async def test_list_response_has_pagination_fields(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/recipes", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "next_cursor" in data
    assert "has_more" in data


async def test_list_pagination_cursor(client):
    token = await _auth_token(client)
    # Create 3 recipes and fetch with limit=2
    for i in range(3):
        await client.post("/api/v1/recipes", json={"title": f"Page Recipe {i}"}, headers=_auth(token))
    page1 = await client.get("/api/v1/recipes?limit=2", headers=_auth(token))
    assert page1.status_code == 200
    page1_data = page1.json()
    assert len(page1_data["items"]) == 2
    assert page1_data["has_more"] is True
    assert page1_data["next_cursor"] is not None

    page2 = await client.get(
        f"/api/v1/recipes?limit=2&cursor={page1_data['next_cursor']}",
        headers=_auth(token),
    )
    assert page2.status_code == 200
    page2_data = page2.json()
    assert len(page2_data["items"]) >= 1
    # No overlap between pages
    page1_ids = {item["id"] for item in page1_data["items"]}
    page2_ids = {item["id"] for item in page2_data["items"]}
    assert page1_ids.isdisjoint(page2_ids)


# ── Update (PATCH) ────────────────────────────────────────────────────────────

async def test_update_creates_new_version(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "Original"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "Updated"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["current_version"]["title"] == "Updated"
    assert data["current_version"]["version_number"] == 2


async def test_update_preserves_unchanged_fields(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Original", "servings": 4, "tags": ["italian"]},
        headers=_auth(token),
    )
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "New Title"},  # only change title
        headers=_auth(token),
    )
    data = r.json()
    assert data["current_version"]["servings"] == 4
    assert data["current_version"]["tags"] == ["italian"]


async def test_update_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Mine", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "Hijacked"},
        headers=_auth(other_token),
    )
    assert r.status_code == 403


# ── Delete ────────────────────────────────────────────────────────────────────

async def test_delete_recipe(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Delete Me"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]
    r = await client.delete(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert r.status_code == 204
    get = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert get.status_code == 404


async def test_delete_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Not Yours", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.delete(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 403


async def test_delete_nonexistent_recipe_returns_404(client):
    token = await _auth_token(client)
    import uuid
    r = await client.delete(f"/api/v1/recipes/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


# ── Version history ───────────────────────────────────────────────────────────

async def test_get_versions_shows_all_versions(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "V1"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    await client.patch(f"/api/v1/recipes/{recipe_id}", json={"title": "V2"}, headers=_auth(token))
    await client.patch(f"/api/v1/recipes/{recipe_id}", json={"title": "V3"}, headers=_auth(token))

    r = await client.get(f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(token))
    assert r.status_code == 200
    versions = r.json()
    assert len(versions) == 3
    numbers = [v["version_number"] for v in versions]
    assert numbers == sorted(numbers, reverse=True)  # newest first


async def test_get_versions_of_private_recipe_as_other_user_returns_404(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Private", "visibility": "private"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(other_token))
    assert r.status_code == 404


# ── Restore ───────────────────────────────────────────────────────────────────

async def test_restore_version_creates_new_version_with_old_content(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Original"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]

    # Get version 1 id
    versions_resp = await client.get(
        f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(token)
    )
    v1_id = next(v["id"] for v in versions_resp.json() if v["version_number"] == 1)

    # Edit to version 2
    await client.patch(
        f"/api/v1/recipes/{recipe_id}", json={"title": "Edited"}, headers=_auth(token)
    )

    # Restore v1
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{v1_id}/restore",
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["current_version"]["title"] == "Original"
    assert data["current_version"]["version_number"] == 3  # new version, not mutation


async def test_restore_nonexistent_version_returns_404(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Recipe"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]
    import uuid
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{uuid.uuid4()}/restore",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_restore_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Mine", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    versions_resp = await client.get(
        f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(owner_token)
    )
    v1_id = versions_resp.json()[0]["id"]
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{v1_id}/restore",
        headers=_auth(other_token),
    )
    assert r.status_code == 403
```

- [ ] **Step 2: Run the full test suite**

```bash
cd backend && uv run pytest tests/ -v --cov=app --cov-report=term-missing
```

Expected: All tests pass. Coverage should be well above 80% for `app/services/recipe_service.py` and `app/api/routes/recipes.py`.

If any test fails, investigate before continuing. Common pitfalls:
- **`current_version_id` FK constraint error on delete:** Ensure you're nullifying `current_version_id` before deleting versions (already handled in `delete_recipe`).
- **Circular FK migration issue:** Re-check the migration file has `create_foreign_key` as a separate step after both tables exist.
- **`model_validate` on RecipeVersion fails:** Ensure `model_config = {"from_attributes": True}` is set on `RecipeVersionResponse`.
- **JSONB fields return as Python dicts not Pydantic objects:** `RecipeVersionResponse.ingredients` is `list[Ingredient]` — Pydantic will validate/coerce the dicts from the DB automatically.

- [ ] **Step 3: Commit**

```bash
cd backend && git add tests/integration/test_recipe_routes.py
git commit -m "test: add recipe route integration tests (CRUD, versioning, pagination)"
```

- [ ] **Step 4: Final check — run just the new tests in isolation**

```bash
cd backend && uv run pytest tests/integration/test_recipe_routes.py -v
```

Expected: All tests pass with no warnings about missing fixtures.
