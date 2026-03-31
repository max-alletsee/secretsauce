# Phase 3: Recipe Import from URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add URL-based recipe import powered by the Gemini API, replacing OpenRouter as the project-wide AI provider.

**Architecture:** A `POST /api/v1/recipes/import/url` endpoint creates an `ImportTask` DB row and fires a FastAPI `BackgroundTask`. The background task calls Gemini with URLContext (Gemini fetches the page itself) and structured output, then creates a private recipe and marks the task completed. The frontend polls `GET /api/v1/import-tasks/{id}` every 3 seconds and navigates to `/recipes/:id/edit` on success.

**Tech Stack:** `google-genai` Python SDK (replaces `openrouter`), Gemini 3.1 Pro, FastAPI BackgroundTasks, SQLModel, Vue 3 Composition API, `@vue/test-utils`, Vitest, pytest-asyncio.

---

## File Map

**Backend — Create:**
- `backend/app/schemas/ai_responses.py` — `RecipeImportResult` Pydantic model (Gemini `response_schema`)
- `backend/app/services/ai_service.py` — Gemini client, `import_recipe_from_url`, `call_ai_structured`
- `backend/app/models/import_task.py` — `ImportTask` SQLModel table
- `backend/app/schemas/import_task.py` — `RecipeImportURLRequest`, `ImportTaskRead`
- `backend/app/services/recipe_import_service.py` — `process_url_import` background task function
- `backend/app/api/routes/import_tasks.py` — two routers: POST import + GET task status
- `backend/tests/unit/test_ai_responses.py`
- `backend/tests/unit/test_ai_service.py`
- `backend/tests/unit/test_recipe_import_service.py`
- `backend/tests/integration/test_import_routes.py`

**Backend — Modify:**
- `backend/pyproject.toml` — remove `openrouter`, add `google-genai`
- `backend/app/core/config.py` — `GEMINI_API_KEY`, `AI_MODEL` default
- `backend/app/core/rate_limit.py` — add import endpoint rate limiting
- `backend/app/main.py` — include the two import routers
- `backend/tests/conftest.py` — import `import_task` model so its table is created in test DB
- `backend/CLAUDE.md` — replace OpenRouter AI integration section with Gemini pattern

**Frontend — Create:**
- `frontend/src/types/importTask.ts`
- `frontend/src/api/importTasks.ts`
- `frontend/src/views/RecipeListView.test.ts`

**Frontend — Modify:**
- `frontend/src/views/RecipeListView.vue` — add URL import form
- `CLAUDE.md` (root) — update env vars table

---

## Implementation Note: `ImportedIngredient.quantity` type

The spec listed `quantity: float | None` but the existing `Ingredient` schema in `app/schemas/recipe.py` uses `quantity: str`. Using `str | None` in the AI response model avoids lossy conversion ("1/2" → 0.5) and lets us pass the value directly to `RecipeCreate` without conversion. This plan uses `str | None`.

---

## Task 1: Swap AI provider — dependencies, config, docs

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/core/config.py`
- Modify: `backend/CLAUDE.md`
- Modify: `CLAUDE.md` (root)

- [ ] **Step 1: Update pyproject.toml**

In `backend/pyproject.toml`, replace `"openrouter>=0.7.11"` with `"google-genai>=1.0.0"` in the `dependencies` list.

The result should look like:
```toml
dependencies = [
    "alembic>=1.18.4",
    "asyncpg>=0.31.0",
    "bcrypt>=5.0.0",
    "cryptography>=46.0.5",
    "fastapi>=0.135.1",
    "fastapi-users[sqlalchemy]>=15.0.4",
    "google-genai>=1.0.0",
    "httpx>=0.28.1",
    "httpx-oauth[google]>=0.16.1",
    "pydantic-settings>=2.13.1",
    "python-multipart>=0.0.22",
    "slowapi>=0.1.9",
    "sqlalchemy[asyncio]>=2.0.48",
    "sqlmodel>=0.0.37",
    "uvicorn[standard]>=0.41.0",
]
```

- [ ] **Step 2: Install the new dependency**

```bash
cd backend && uv sync
```

Expected: resolves `google-genai` and removes `openrouter` from the lockfile.

- [ ] **Step 3: Update config.py**

Replace the contents of `backend/app/core/config.py` with:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Required
    DATABASE_URL: str
    SECRET_KEY: str
    GEMINI_API_KEY: str
    UPLOAD_DIR: str = "/tmp/secretsauce-uploads"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Optional with defaults
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AI_MODEL: str = "gemini-3.1-pro-preview"
    AI_TIMEOUT_SECONDS: int = 60
    AI_MAX_RETRIES: int = 3
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Google OAuth — leave empty to disable Google login
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""


settings = Settings()
```

- [ ] **Step 4: Update backend/CLAUDE.md — AI Integration section**

Replace the entire "## AI Integration" section in `backend/CLAUDE.md` (from `### Provider` through the end of `### Recipe Import Pipeline`) with:

```markdown
## AI Integration

### Provider
Google Gemini via the `google-genai` Python SDK. Do NOT use the `openai` package, `openrouter`, or `instructor` library.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=settings.GEMINI_API_KEY)
```

The shared client lives in `app/services/ai_service.py` as a module-level singleton (`_client`). Use `client.aio` for all async calls.

### Structured Outputs
All AI calls use Gemini's native `response_schema` parameter with Pydantic models. Define expected output schemas in `app/schemas/ai_responses.py`.

```python
response = await client.aio.models.generate_content(
    model=settings.AI_MODEL,
    contents=prompt,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=MyResponseModel,
    ),
)
result = MyResponseModel.model_validate_json(response.text)
```

### URL Context
For recipe import from URL, pass the URL in the prompt and enable the `url_context` tool. Gemini fetches and reads the page itself — no separate `httpx` fetch needed.

```python
config=types.GenerateContentConfig(
    tools=[types.Tool(url_context=types.UrlContext())],
    response_mime_type="application/json",
    response_schema=RecipeImportResult,
)
```

### Fallback and Error Handling
- Wrap all AI calls in retry logic (max 3 attempts, exponential backoff: 1s, 2s, 4s).
- On permanent failure, raise `AIServiceError` (defined in `ai_service.py`).
- The import service catches `AIServiceError` and marks the `ImportTask` as `failed`.
- Set timeout of 60 seconds per AI call via `asyncio.wait_for`.
- Log all AI calls: model, URL/prompt summary, latency, token counts, success/failure.

### Recipe Import Pipeline
1. User submits a URL via `POST /api/v1/recipes/import/url`.
2. Route creates an `ImportTask` row (status=`pending`), fires `BackgroundTask`, returns 202.
3. Background task (`process_url_import`) creates its own `AsyncSession` — the request session is closed.
4. Gemini URLContext fetches the URL and extracts recipe data into `RecipeImportResult`.
5. Validation: non-empty title, at least 1 ingredient, at least 1 step.
6. Tags filtered to `ALL_TAGS` constants only (unknown tags silently dropped).
7. `recipe_service.create_recipe` persists the recipe as `private`.
8. Task status set to `completed` with `recipe_id`, or `failed` with `error_message`.
9. Frontend polls `GET /api/v1/import-tasks/{id}` every 3 seconds and navigates to edit view on completion.
```

- [ ] **Step 5: Update root CLAUDE.md env vars table**

In the root `CLAUDE.md`, find the "Required env vars" block under "## Configuration" and replace `OPENROUTER_API_KEY=<key>` with `GEMINI_API_KEY=<key>`.

- [ ] **Step 6: Commit**

```bash
cd backend && git add pyproject.toml app/core/config.py CLAUDE.md
cd .. && git add CLAUDE.md
git commit -m "feat: replace OpenRouter with Gemini as AI provider"
```

---

## Task 2: AI response schema

**Files:**
- Create: `backend/app/schemas/ai_responses.py`
- Create: `backend/tests/unit/test_ai_responses.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_ai_responses.py`:

```python
# backend/tests/unit/test_ai_responses.py
import pytest
from pydantic import ValidationError

from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)


def test_recipe_import_result_parses_full_response():
    data = {
        "title": "Spaghetti Carbonara",
        "description": "Classic Italian pasta",
        "ingredients": [
            {"name": "spaghetti", "quantity": "200", "unit": "g"},
            {"name": "eggs", "quantity": "2", "unit": None},
        ],
        "steps": [
            {"order": 1, "instruction": "Boil pasta in salted water"},
            {"order": 2, "instruction": "Fry guanciale until crispy"},
        ],
        "servings": 2,
        "prep_time_minutes": 10,
        "waiting_time_minutes": None,
        "cook_time_minutes": 15,
        "tags": ["italian", "dinner"],
        "recipe_source": {"type": "url", "url": "https://example.com/carbonara"},
    }
    result = RecipeImportResult.model_validate(data)
    assert result.title == "Spaghetti Carbonara"
    assert len(result.ingredients) == 2
    assert result.ingredients[0].quantity == "200"
    assert result.ingredients[1].quantity == "2"
    assert result.ingredients[1].unit is None
    assert len(result.steps) == 2
    assert result.steps[0].order == 1
    assert result.tags == ["italian", "dinner"]
    assert result.recipe_source.url == "https://example.com/carbonara"
    assert result.recipe_source.type == "url"


def test_recipe_import_result_optional_fields_default_to_none():
    data = {
        "title": "Simple Salad",
        "ingredients": [{"name": "lettuce", "quantity": None, "unit": None}],
        "steps": [{"order": 1, "instruction": "Toss everything together"}],
        "recipe_source": {"type": "url", "url": "https://example.com/salad"},
    }
    result = RecipeImportResult.model_validate(data)
    assert result.description is None
    assert result.servings is None
    assert result.prep_time_minutes is None
    assert result.waiting_time_minutes is None
    assert result.cook_time_minutes is None
    assert result.tags == []


def test_recipe_import_result_requires_title():
    data = {
        "ingredients": [{"name": "pasta", "quantity": "200", "unit": "g"}],
        "steps": [{"order": 1, "instruction": "Cook pasta"}],
        "recipe_source": {"type": "url", "url": "https://example.com"},
    }
    with pytest.raises(ValidationError):
        RecipeImportResult.model_validate(data)


def test_imported_ingredient_quantity_accepts_fractions():
    ingredient = ImportedIngredient(name="flour", quantity="1/2", unit="cup")
    assert ingredient.quantity == "1/2"


def test_imported_recipe_source_type_must_be_url():
    with pytest.raises(ValidationError):
        ImportedRecipeSource(type="book", url="https://example.com")  # type: ignore
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && pytest tests/unit/test_ai_responses.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.schemas.ai_responses'`

- [ ] **Step 3: Create app/schemas/ai_responses.py**

```python
# backend/app/schemas/ai_responses.py
from typing import Literal

from pydantic import BaseModel


class ImportedIngredient(BaseModel):
    name: str
    # str (not float) to preserve fractional quantities like "1/2" or "3-4"
    # that Gemini may return. Matches the existing Ingredient.quantity: str type.
    quantity: str | None = None
    unit: str | None = None


class ImportedStep(BaseModel):
    order: int
    instruction: str


class ImportedRecipeSource(BaseModel):
    type: Literal["url"]
    url: str


class RecipeImportResult(BaseModel):
    title: str
    description: str | None = None
    ingredients: list[ImportedIngredient]
    steps: list[ImportedStep]
    servings: int | None = None
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] = []
    recipe_source: ImportedRecipeSource
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && pytest tests/unit/test_ai_responses.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/ai_responses.py backend/tests/unit/test_ai_responses.py
git commit -m "feat: add RecipeImportResult schema for Gemini structured output"
```

---

## Task 3: AI service

**Files:**
- Create: `backend/app/services/ai_service.py`
- Create: `backend/tests/unit/test_ai_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_ai_service.py`:

```python
# backend/tests/unit/test_ai_service.py
import asyncio
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)
from app.services.ai_service import AIServiceError, import_recipe_from_url

_VALID_RESULT = RecipeImportResult(
    title="Pasta",
    description="Simple pasta",
    ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
    steps=[ImportedStep(order=1, instruction="Cook pasta")],
    servings=2,
    prep_time_minutes=5,
    waiting_time_minutes=None,
    cook_time_minutes=10,
    tags=["italian"],
    recipe_source=ImportedRecipeSource(type="url", url="https://example.com/pasta"),
)


def _make_mock_client(response_text: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = response_text
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_import_recipe_from_url_success():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    with patch("app.services.ai_service._client", mock_client):
        result = await import_recipe_from_url("https://example.com/pasta")
    assert result.title == "Pasta"
    assert len(result.ingredients) == 1
    assert result.ingredients[0].name == "pasta"
    assert result.recipe_source.url == "https://example.com/pasta"


@pytest.mark.asyncio
async def test_import_recipe_from_url_retries_on_transient_failure():
    mock_response = MagicMock()
    mock_response.text = _VALID_RESULT.model_dump_json()
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    # first call fails, second succeeds
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=[Exception("network error"), mock_response]
    )
    with patch("app.services.ai_service._client", mock_client):
        with patch("asyncio.sleep", AsyncMock()):
            result = await import_recipe_from_url("https://example.com/pasta")
    assert result.title == "Pasta"
    assert mock_client.aio.models.generate_content.call_count == 2


@pytest.mark.asyncio
async def test_import_recipe_from_url_raises_after_max_retries():
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("persistent server error")
    )
    with patch("app.services.ai_service._client", mock_client):
        with patch("asyncio.sleep", AsyncMock()):
            with pytest.raises(AIServiceError, match="Import failed after"):
                await import_recipe_from_url("https://example.com/pasta")
    assert mock_client.aio.models.generate_content.call_count == 3  # AI_MAX_RETRIES default


@pytest.mark.asyncio
async def test_import_recipe_from_url_passes_url_in_prompt():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    url = "https://example.com/my-recipe"
    with patch("app.services.ai_service._client", mock_client):
        await import_recipe_from_url(url)
    call_kwargs = mock_client.aio.models.generate_content.call_args
    contents = call_kwargs.kwargs.get("contents") or call_kwargs.args[1]
    assert url in contents
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/unit/test_ai_service.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.ai_service'`

- [ ] **Step 3: Create app/services/ai_service.py**

```python
# backend/app/services/ai_service.py
import asyncio
import logging
import time

from google import genai
from google.genai import types

from app.core.config import settings
from app.schemas.ai_responses import RecipeImportResult

logger = logging.getLogger(__name__)

_client: genai.Client | None = None

_IMPORT_PROMPT_TEMPLATE = (
    "Extract the complete recipe from this URL: {url}\n\n"
    "Return all recipe details: title, description, ingredients with quantities and units, "
    "numbered steps, servings, prep/cook/waiting times in minutes. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)


class AIServiceError(Exception):
    pass


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


async def import_recipe_from_url(url: str) -> RecipeImportResult:
    """Call Gemini with URLContext to extract a recipe from the given URL.

    Gemini fetches and reads the page itself via the url_context tool.
    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    prompt = _IMPORT_PROMPT_TEMPLATE.format(url=url)
    last_error: Exception | None = None

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(url_context=types.UrlContext())],
                        response_mime_type="application/json",
                        response_schema=RecipeImportResult,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI import success | model=%s url=%s latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                url,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI import attempt %d/%d failed | url=%s latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                url,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    raise AIServiceError(
        f"Import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def call_ai_structured(prompt: str, response_model: type) -> object:
    """General-purpose structured Gemini call for future features (meal planning etc.).

    Returns a validated instance of response_model.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    last_error: Exception | None = None

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=response_model,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            logger.info(
                "AI structured call success | model=%s latency=%.2fs",
                settings.AI_MODEL,
                elapsed,
            )
            return response_model.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI structured call attempt %d/%d failed | latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    raise AIServiceError(
        f"AI call failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && pytest tests/unit/test_ai_service.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_service.py backend/tests/unit/test_ai_service.py
git commit -m "feat: add Gemini AI service with URLContext and structured output"
```

---

## Task 4: ImportTask model + Alembic migration + conftest update

**Files:**
- Create: `backend/app/models/import_task.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Create app/models/import_task.py**

```python
# backend/app/models/import_task.py
import uuid
from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Uuid
from sqlmodel import Field, SQLModel


class ImportTaskStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportTask(SQLModel, table=True):
    __tablename__ = "import_tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_import_tasks_user_id"),
            nullable=False,
            index=True,
        )
    )
    url: str = Field(sa_column=Column(Text, nullable=False))
    status: ImportTaskStatus = Field(
        default=ImportTaskStatus.PENDING,
        sa_column=Column(String(20), nullable=False, server_default="pending"),
    )
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_import_tasks_recipe_id"),
            nullable=True,
        ),
    )
    error_message: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    # NOTE: async sessions using session.execute(update(...)) do NOT fire onupdate.
    # Always set updated_at explicitly on every status transition.
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
```

- [ ] **Step 2: Update tests/conftest.py to register the new model**

Add one import line after the existing model imports in `backend/tests/conftest.py`:

```python
from app.models import import_task as _import_task_models  # noqa: F401 — registers ImportTask in SQLModel.metadata
```

The imports section of conftest.py should now read:

```python
from app.models import user as _user_models  # noqa: F401 — registers User table in SQLModel.metadata
from app.models import recipe as _recipe_models  # noqa: F401 — registers Recipe/RecipeVersion in SQLModel.metadata
from app.models import import_task as _import_task_models  # noqa: F401 — registers ImportTask in SQLModel.metadata
```

- [ ] **Step 3: Generate Alembic migration**

```bash
cd backend && alembic revision --autogenerate -m "add import_tasks table"
```

Expected: a new file appears in `backend/alembic/versions/` with `add_import_tasks_table` in the name.

- [ ] **Step 4: Review the generated migration**

Open the generated file and verify it:
- Creates the `import_tasks` table
- Has the correct columns: `id`, `user_id`, `url`, `status`, `recipe_id`, `error_message`, `created_at`, `updated_at`
- Has FK constraints to `users.id` and `recipes.id`
- Has index on `user_id`

If the migration looks correct, apply it:

```bash
alembic upgrade head
```

Expected: `Running upgrade ... -> ..., add import_tasks table`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/import_task.py backend/tests/conftest.py
git add backend/alembic/versions/
git commit -m "feat: add ImportTask model and migration"
```

---

## Task 5: ImportTask schemas

**Files:**
- Create: `backend/app/schemas/import_task.py`

- [ ] **Step 1: Create app/schemas/import_task.py**

```python
# backend/app/schemas/import_task.py
import uuid
from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, ConfigDict

from app.models.import_task import ImportTaskStatus


class RecipeImportURLRequest(BaseModel):
    url: AnyHttpUrl


class ImportTaskCreated(BaseModel):
    task_id: uuid.UUID
    status: ImportTaskStatus


class ImportTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImportTaskStatus
    recipe_id: uuid.UUID | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/import_task.py
git commit -m "feat: add ImportTask request/response schemas"
```

---

## Task 6: Recipe import background service

**Files:**
- Create: `backend/app/services/recipe_import_service.py`
- Create: `backend/tests/unit/test_recipe_import_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_recipe_import_service.py`:

```python
# backend/tests/unit/test_recipe_import_service.py
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)
from app.services.ai_service import AIServiceError
from app.services.recipe_import_service import process_url_import

_URL = "https://example.com/pasta"


def _valid_result(url: str = _URL) -> RecipeImportResult:
    return RecipeImportResult(
        title="Pasta",
        description="Simple pasta",
        ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
        steps=[ImportedStep(order=1, instruction="Cook pasta until al dente")],
        servings=2,
        prep_time_minutes=5,
        waiting_time_minutes=None,
        cook_time_minutes=10,
        # includes a tag that's not in ALL_TAGS — should be silently dropped
        tags=["italian", "dinner", "totally-made-up-tag"],
        recipe_source=ImportedRecipeSource(type="url", url=url),
    )


def _make_db_and_session_ctx(mock_task: MagicMock) -> tuple[AsyncMock, MagicMock]:
    """Return (mock_db, mock_session_ctx) where mock_db.get returns mock_task."""
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_db, mock_session_ctx


@pytest.mark.asyncio
async def test_process_url_import_happy_path():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=_valid_result()),
        ):
            with patch(
                "app.services.recipe_import_service.recipe_service.create_recipe",
                AsyncMock(return_value=(mock_recipe, MagicMock())),
            ):
                await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id


@pytest.mark.asyncio
async def test_process_url_import_filters_unknown_tags():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = uuid.uuid4()
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    captured: dict = {}

    async def capture_create(db, owner_id, data):
        captured["tags"] = data.tags
        return (mock_recipe, MagicMock())

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=_valid_result()),
        ):
            with patch(
                "app.services.recipe_import_service.recipe_service.create_recipe",
                capture_create,
            ):
                await process_url_import(task_id, _URL, user_id)

    assert "italian" in captured["tags"]
    assert "dinner" in captured["tags"]
    assert "totally-made-up-tag" not in captured["tags"]


@pytest.mark.asyncio
async def test_process_url_import_sets_failed_on_ai_error():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(side_effect=AIServiceError("Gemini timeout")),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "Gemini timeout" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_url_import_fails_on_empty_ingredients():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    no_ingredients = RecipeImportResult(
        title="Pasta",
        ingredients=[],
        steps=[ImportedStep(order=1, instruction="Cook pasta")],
        recipe_source=ImportedRecipeSource(type="url", url=_URL),
    )

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=no_ingredients),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "no ingredients" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_url_import_fails_on_empty_steps():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    no_steps = RecipeImportResult(
        title="Pasta",
        ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
        steps=[],
        recipe_source=ImportedRecipeSource(type="url", url=_URL),
    )

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=no_steps),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "no steps" in mock_task.error_message
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.recipe_import_service'`

- [ ] **Step 3: Create app/services/recipe_import_service.py**

```python
# backend/app/services/recipe_import_service.py
import logging
import uuid
from datetime import datetime, timezone

from app.core.constants import ALL_TAGS
from app.core.database import async_session_factory
from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.ai_responses import RecipeImportResult
from app.schemas.recipe import Ingredient, RecipeCreate, RecipeSource, Step
from app.services import ai_service, recipe_service

logger = logging.getLogger(__name__)


async def process_url_import(task_id: uuid.UUID, url: str, user_id: uuid.UUID) -> None:
    """Background task: call Gemini to extract a recipe from url, save it, update the task.

    Creates its own AsyncSession because BackgroundTasks run after the request session closes.
    """
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
            result: RecipeImportResult = await ai_service.import_recipe_from_url(url)

            if not result.title:
                raise ValueError("Extracted recipe has no title")
            if not result.ingredients:
                raise ValueError("Extracted recipe has no ingredients")
            if not result.steps:
                raise ValueError("Extracted recipe has no steps")

            # Drop any tags Gemini returned that aren't in the pre-built set
            filtered_tags = [t for t in result.tags if t in ALL_TAGS]

            recipe_data = RecipeCreate(
                title=result.title,
                description=result.description,
                ingredients=[
                    Ingredient(name=i.name, quantity=i.quantity or "", unit=i.unit)
                    for i in result.ingredients
                ],
                steps=[
                    Step(order=s.order, instruction=s.instruction)
                    for s in result.steps
                ],
                servings=result.servings if result.servings is not None else 2,
                prep_time_minutes=result.prep_time_minutes,
                waiting_time_minutes=result.waiting_time_minutes,
                cook_time_minutes=result.cook_time_minutes,
                tags=filtered_tags,
                recipe_source=RecipeSource(type="url", url=url),
            )

            recipe, _ = await recipe_service.create_recipe(db, user_id, recipe_data)

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.updated_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Import task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recipe_import_service.py backend/tests/unit/test_recipe_import_service.py
git commit -m "feat: add recipe URL import background service"
```

---

## Task 7: Import routes, rate limiting, and wire to main.py

**Files:**
- Create: `backend/app/api/routes/import_tasks.py`
- Modify: `backend/app/core/rate_limit.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/integration/test_import_routes.py`

- [ ] **Step 1: Write failing integration tests**

Create `backend/tests/integration/test_import_routes.py`:

```python
# backend/tests/integration/test_import_routes.py
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.import_task import ImportTask, ImportTaskStatus
from tests.conftest import unique_email


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("import")
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


# ── POST /api/v1/recipes/import/url ──────────────────────────────────────────

async def test_import_url_requires_auth(client):
    r = await client.post(
        "/api/v1/recipes/import/url", json={"url": "https://example.com/recipe"}
    )
    assert r.status_code == 401


async def test_import_url_rejects_invalid_url(client):
    token = await _auth_token(client)
    r = await client.post(
        "/api/v1/recipes/import/url",
        json={"url": "not-a-url"},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_import_url_returns_202_and_creates_task(client):
    token = await _auth_token(client)
    with patch(
        "app.api.routes.import_tasks.process_url_import",
        AsyncMock(),  # prevent background task from actually running
    ):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token),
        )
    assert r.status_code == 202
    data = r.json()
    assert "task_id" in data
    assert data["status"] == "pending"
    # task_id should be a valid UUID
    uuid.UUID(data["task_id"])


# ── GET /api/v1/import-tasks/{task_id} ───────────────────────────────────────

async def test_get_import_task_requires_auth(client):
    r = await client.get(f"/api/v1/import-tasks/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_get_import_task_returns_404_for_unknown_id(client):
    token = await _auth_token(client)
    r = await client.get(
        f"/api/v1/import-tasks/{uuid.uuid4()}",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_get_import_task_returns_404_for_other_users_task(client):
    # User A creates a task
    token_a = await _auth_token(client)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token_a),
        )
    task_id = r.json()["task_id"]

    # User B tries to access it
    token_b = await _auth_token(client)
    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token_b))
    assert r.status_code == 404


async def test_get_import_task_returns_task_for_owner(client):
    token = await _auth_token(client)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token),
        )
    task_id = post.json()["task_id"]

    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == task_id
    assert data["status"] == "pending"
    assert data["recipe_id"] is None
    assert data["error_message"] is None
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/integration/test_import_routes.py -v
```

Expected: errors because the routes don't exist yet.

- [ ] **Step 3: Create app/api/routes/import_tasks.py**

```python
# backend/app/api/routes/import_tasks.py
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.user import User
from app.schemas.import_task import ImportTaskCreated, ImportTaskRead, RecipeImportURLRequest
from app.services.recipe_import_service import process_url_import

# Mounted at /api/v1/recipes in main.py
recipes_router = APIRouter()

# Mounted at /api/v1/import-tasks in main.py
tasks_router = APIRouter()


@recipes_router.post("/import/url", status_code=202, response_model=ImportTaskCreated)
async def import_recipe_from_url(
    payload: RecipeImportURLRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    task = ImportTask(user_id=user.id, url=str(payload.url))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    # process_url_import creates its own session — do NOT pass db here
    background_tasks.add_task(process_url_import, task.id, str(payload.url), user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)


@tasks_router.get("/{task_id}", response_model=ImportTaskRead)
async def get_import_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskRead:
    task = await db.get(ImportTask, task_id)
    # Return 404 whether the task doesn't exist or belongs to a different user
    # to avoid leaking whether a task exists.
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Import task not found")
    return ImportTaskRead.model_validate(task)
```

- [ ] **Step 4: Extend rate_limit.py with import endpoint limiting**

Add these declarations to `backend/app/core/rate_limit.py` after the existing auth declarations, and extend the middleware function:

```python
# backend/app/core/rate_limit.py
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Request
from fastapi.responses import JSONResponse

# Paths to rate-limit: 10 attempts per minute per client IP
_AUTH_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/jwt/login"}
_AUTH_LIMIT = 10
_AUTH_WINDOW = timedelta(minutes=1)

# Import endpoint: 100 attempts per hour per client IP
_IMPORT_PATHS = {"/api/v1/recipes/import/url"}
_IMPORT_LIMIT = 100
_IMPORT_WINDOW = timedelta(hours=1)

# In-memory stores. Single-process only — migrate to Redis in Phase 10 hardening.
_auth_attempts: dict[str, list[datetime]] = defaultdict(list)
_import_attempts: dict[str, list[datetime]] = defaultdict(list)


async def rate_limit_middleware(request: Request, call_next):
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

    elif request.url.path in _IMPORT_PATHS:
        cutoff = now - _IMPORT_WINDOW
        _import_attempts[client_ip] = [t for t in _import_attempts[client_ip] if t > cutoff]
        if len(_import_attempts[client_ip]) >= _IMPORT_LIMIT:
            return JSONResponse(
                {"detail": "Too many import requests. Try again later."},
                status_code=429,
            )
        _import_attempts[client_ip].append(now)

    return await call_next(request)
```

- [ ] **Step 5: Wire the two routers into main.py**

Add the import and two `include_router` calls to `backend/app/main.py`:

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, recipes
from app.api.routes.import_tasks import recipes_router as import_recipes_router
from app.api.routes.import_tasks import tasks_router as import_tasks_router
from app.api.routes.users import auth_router, users_router
from app.core.config import settings
from app.core.rate_limit import rate_limit_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="secretsauce.food API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(rate_limit_middleware)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["recipes"])
app.include_router(import_recipes_router, prefix="/api/v1/recipes", tags=["import"])
app.include_router(import_tasks_router, prefix="/api/v1/import-tasks", tags=["import"])
```

- [ ] **Step 6: Update conftest.py to clear import rate limit state**

In `backend/tests/conftest.py`, update the `clear_rate_limit_state` fixture to also clear import attempts:

```python
@pytest.fixture(autouse=True)
def clear_rate_limit_state():
    """Reset in-memory rate-limit counters before every test to prevent test bleed-through."""
    _rate_limit_module._auth_attempts.clear()
    _rate_limit_module._import_attempts.clear()
```

- [ ] **Step 7: Run integration tests**

```bash
cd backend && pytest tests/integration/test_import_routes.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 8: Run the full test suite to confirm no regressions**

```bash
cd backend && pytest --cov=app --cov-report=term-missing
```

Expected: all tests pass, coverage ≥ 80%.

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/routes/import_tasks.py
git add backend/app/core/rate_limit.py
git add backend/app/main.py
git add backend/tests/conftest.py
git add backend/tests/integration/test_import_routes.py
git commit -m "feat: add recipe URL import routes and rate limiting"
```

---

## Task 8: Frontend types and API client

**Files:**
- Create: `frontend/src/types/importTask.ts`
- Create: `frontend/src/api/importTasks.ts`

- [ ] **Step 1: Create frontend/src/types/importTask.ts**

```typescript
// frontend/src/types/importTask.ts

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
```

- [ ] **Step 2: Create frontend/src/api/importTasks.ts**

```typescript
// frontend/src/api/importTasks.ts
import client from './client'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

export const importRecipeFromUrl = (url: string) =>
  client.post<ImportTaskCreated>('/recipes/import/url', { url })

export const getImportTask = (taskId: string) =>
  client.get<ImportTask>(`/import-tasks/${taskId}`)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/importTask.ts frontend/src/api/importTasks.ts
git commit -m "feat: add importTask types and API client functions"
```

---

## Task 9: Frontend RecipeListView import UI + component test

**Files:**
- Modify: `frontend/src/views/RecipeListView.vue`
- Create: `frontend/src/views/RecipeListView.test.ts`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/views/RecipeListView.test.ts`:

```typescript
// frontend/src/views/RecipeListView.test.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

// Mock vue-router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  RouterLink: { template: '<a><slot /></a>' },
}))

// Mock recipe store
vi.mock('@/stores/useRecipeStore', () => ({
  useRecipeStore: () => ({
    recipes: [],
    loading: false,
    hasMore: false,
    fetchRecipes: vi.fn(),
    loadMore: vi.fn(),
  }),
}))

// Mock importTasks API
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import RecipeListView from './RecipeListView.vue'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

describe('RecipeListView — import flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows import form with url input and import button', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="import-url-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="import-submit-btn"]').exists()).toBe(true)
  })

  it('disables input and shows spinner while importing', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )

    const wrapper = mount(RecipeListView)
    const input = wrapper.find('[data-testid="import-url-input"]')
    const button = wrapper.find('[data-testid="import-submit-btn"]')

    await input.setValue('https://example.com/recipe')
    await button.trigger('click')
    await wrapper.vm.$nextTick()

    expect((input.element as HTMLInputElement).disabled).toBe(true)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-testid="import-spinner"]').exists()).toBe(true)
  })

  it('navigates to edit view when task completes', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )
    vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'completed',
        recipe_id: 'recipe-42',
        error_message: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    )

    const wrapper = mount(RecipeListView)
    await wrapper.find('[data-testid="import-url-input"]').setValue('https://example.com/recipe')
    await wrapper.find('[data-testid="import-submit-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // advance the 3-second poll interval
    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith('/recipes/recipe-42/edit')
  })

  it('shows error message and re-enables form when task fails', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )
    vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'failed',
        recipe_id: null,
        error_message: 'Could not extract recipe from page',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    )

    const wrapper = mount(RecipeListView)
    await wrapper.find('[data-testid="import-url-input"]').setValue('https://example.com/recipe')
    await wrapper.find('[data-testid="import-submit-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="import-error"]').text()).toContain(
      'Could not extract recipe from page',
    )
    const input = wrapper.find('[data-testid="import-url-input"]')
    expect((input.element as HTMLInputElement).disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd frontend && npx vitest run src/views/RecipeListView.test.ts
```

Expected: tests fail because `data-testid` attributes don't exist yet.

- [ ] **Step 3: Update RecipeListView.vue**

Replace `frontend/src/views/RecipeListView.vue` with:

```vue
<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as importTasksApi from '@/api/importTasks'
import RecipeCard from '@/components/RecipeCard.vue'

const recipeStore = useRecipeStore()
const router = useRouter()

// ── Import state ──────────────────────────────────────────────────────────────
const importUrl = ref('')
const importStatus = ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle')
const importError = ref<string | null>(null)
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)

function stopPolling() {
  if (pollInterval.value !== null) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

async function submitImport() {
  if (!importUrl.value || importStatus.value === 'pending' || importStatus.value === 'processing') return
  importError.value = null
  importStatus.value = 'pending'

  const { data } = await importTasksApi.importRecipeFromUrl(importUrl.value)
  const taskId = data.task_id

  pollInterval.value = setInterval(async () => {
    const { data: task } = await importTasksApi.getImportTask(taskId)
    importStatus.value = task.status

    if (task.status === 'completed' && task.recipe_id) {
      stopPolling()
      router.push(`/recipes/${task.recipe_id}/edit`)
    } else if (task.status === 'failed') {
      stopPolling()
      importError.value = task.error_message ?? 'Import failed'
    }
  }, 3000)
}

onMounted(() => {
  recipeStore.fetchRecipes()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
    </header>

    <section class="import-section">
      <div class="import-section__form">
        <input
          v-model="importUrl"
          data-testid="import-url-input"
          type="url"
          placeholder="Paste a recipe URL to import…"
          :disabled="importStatus === 'pending' || importStatus === 'processing'"
          class="import-section__input"
          @keyup.enter="submitImport"
        />
        <button
          data-testid="import-submit-btn"
          :disabled="!importUrl || importStatus === 'pending' || importStatus === 'processing'"
          class="import-section__btn"
          @click="submitImport"
        >
          <span v-if="importStatus === 'pending' || importStatus === 'processing'">
            <span data-testid="import-spinner" aria-hidden="true">⏳</span>
            Importing…
          </span>
          <span v-else>Import</span>
        </button>
      </div>
      <p v-if="importError" data-testid="import-error" class="import-section__error">
        {{ importError }}
      </p>
    </section>

    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
      Loading recipes…
    </p>

    <p v-else-if="!recipeStore.recipes.length" class="recipe-list-page__empty">
      No recipes yet. Create your first one!
    </p>

    <div v-else class="recipe-grid">
      <RecipeCard
        v-for="recipe in recipeStore.recipes"
        :key="recipe.id"
        :recipe="recipe"
      />
    </div>

    <button
      v-if="recipeStore.hasMore && recipeStore.recipes.length"
      class="recipe-list-page__load-more"
      :disabled="recipeStore.loading"
      @click="recipeStore.loadMore()"
    >
      {{ recipeStore.loading ? 'Loading…' : 'Load more' }}
    </button>

    <RouterLink to="/recipes/new" class="fab" aria-label="Create recipe">+</RouterLink>
  </main>
</template>

<style scoped>
.recipe-list-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}
.recipe-list-page__header {
  margin-bottom: 1rem;
}
.recipe-list-page__header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
.recipe-list-page__loading,
.recipe-list-page__empty {
  text-align: center;
  color: #6b7280;
  padding: 3rem 0;
}
.import-section {
  margin-bottom: 1.5rem;
}
.import-section__form {
  display: flex;
  gap: 0.5rem;
}
.import-section__input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.import-section__input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}
.import-section__btn {
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}
.import-section__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.import-section__error {
  margin-top: 0.5rem;
  color: #dc2626;
  font-size: 0.875rem;
}
.recipe-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
@media (min-width: 768px) {
  .recipe-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 1024px) {
  .recipe-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.recipe-list-page__load-more {
  display: block;
  margin: 1.5rem auto 0;
  padding: 0.625rem 2rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}
.recipe-list-page__load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  background: #2563eb;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}
</style>
```

- [ ] **Step 4: Run component tests**

```bash
cd frontend && npx vitest run src/views/RecipeListView.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full frontend test suite to confirm no regressions**

```bash
cd frontend && npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Run type-check and lint**

```bash
cd frontend && npm run type-check && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/RecipeListView.vue frontend/src/views/RecipeListView.test.ts
git add frontend/src/types/importTask.ts frontend/src/api/importTasks.ts
git commit -m "feat: add URL import UI to recipe list view"
```
