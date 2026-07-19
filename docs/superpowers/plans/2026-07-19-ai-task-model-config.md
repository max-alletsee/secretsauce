# Per-Task Gemini Model & Prompt Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Gemini model selection and prompt templates out of `ai_service.py` into a single new `app/core/ai_config.py`, so recipe import/generation uses `gemini-3.1-pro-preview` and meal suggestions (and any future task) uses `gemini-3.1-flash-lite`, reviewable/editable in one file.

**Architecture:** A new `app/core/ai_config.py` defines an `AITask` enum, a `TASK_MODELS` dict mapping task → model string, a `get_model(call_type: str) -> str` lookup function with a Flash Lite fallback for unknown call types, and the four existing prompt template strings (moved verbatim). `ai_service.py` imports from it and swaps `settings.AI_MODEL` for `ai_config.get_model(call_type)` at each of its four Gemini call sites. `AI_MODEL` is removed from `config.py` and `.env.example`.

**Tech Stack:** Python 3.12, FastAPI backend, pytest for tests. No new dependencies.

## Global Constraints

- `url_import`, `image_import`, `recipe_generate` → model `gemini-3.1-pro-preview`.
- `meal_suggestions` and any unregistered `call_type` → model `gemini-3.1-flash-lite`.
- New file: `app/core/ai_config.py`. No env-var override for per-task model — code-only, single file, easy to review.
- `AI_TIMEOUT_SECONDS` and `AI_MAX_RETRIES` stay global in `config.py`, unchanged.
- Prompt template text itself does not change — only its location moves.
- No signature changes to any public function in `ai_service.py`.
- Tests must not make real Gemini calls; continue mocking `app.services.ai_service._client`.
- Run `pytest --cov=app --cov-report=term-missing` from `backend/` after the change; all tests must pass.

---

### Task 1: Create `app/core/ai_config.py` with model registry and prompts

**Files:**
- Create: `backend/app/core/ai_config.py`
- Test: `backend/tests/unit/test_ai_config.py`

**Interfaces:**
- Produces: `AITask` (str Enum) with members `URL_IMPORT = "url_import"`, `IMAGE_IMPORT = "image_import"`, `RECIPE_GENERATE = "recipe_generate"`, `MEAL_SUGGESTIONS = "meal_suggestions"`.
- Produces: `MODEL_PRO = "gemini-3.1-pro-preview"`, `MODEL_FLASH_LITE = "gemini-3.1-flash-lite"`.
- Produces: `DEFAULT_MODEL = MODEL_FLASH_LITE`.
- Produces: `TASK_MODELS: dict[AITask, str]`.
- Produces: `get_model(call_type: str) -> str`.
- Produces: `IMPORT_PROMPT_TEMPLATE: str`, `GENERATE_PROMPT_TEMPLATE: str`, `IMAGE_IMPORT_PROMPT_TEMPLATE: str`, `SUGGESTIONS_SYSTEM_PROMPT: str` (exact text copied from `backend/app/services/ai_service.py` lines 20-62 and 396-402, unchanged).

- [ ] **Step 1: Write the failing test for `get_model`**

Create `backend/tests/unit/test_ai_config.py`:

```python
# backend/tests/unit/test_ai_config.py
from app.core.ai_config import (
    MODEL_FLASH_LITE,
    MODEL_PRO,
    get_model,
)


def test_get_model_url_import_is_pro():
    assert get_model("url_import") == MODEL_PRO


def test_get_model_image_import_is_pro():
    assert get_model("image_import") == MODEL_PRO


def test_get_model_recipe_generate_is_pro():
    assert get_model("recipe_generate") == MODEL_PRO


def test_get_model_meal_suggestions_is_flash_lite():
    assert get_model("meal_suggestions") == MODEL_FLASH_LITE


def test_get_model_unknown_call_type_falls_back_to_flash_lite():
    assert get_model("some_future_task") == MODEL_FLASH_LITE
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_ai_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.ai_config'`

- [ ] **Step 3: Write `app/core/ai_config.py`**

First, read the exact current prompt text to copy verbatim:

```bash
sed -n '20,62p;396,402p' backend/app/services/ai_service.py
```

Then create `backend/app/core/ai_config.py`:

```python
# backend/app/core/ai_config.py
"""Per-task Gemini model selection and prompt templates.

This is the single place to review or change which Gemini model handles
each AI task, and to edit the prompt text sent for that task.
"""
from enum import Enum


class AITask(str, Enum):
    URL_IMPORT = "url_import"
    IMAGE_IMPORT = "image_import"
    RECIPE_GENERATE = "recipe_generate"
    MEAL_SUGGESTIONS = "meal_suggestions"


MODEL_PRO = "gemini-3.1-pro-preview"
MODEL_FLASH_LITE = "gemini-3.1-flash-lite"

# Fallback model for any call_type not listed in TASK_MODELS below
# (e.g. a future call_ai_structured() caller that hasn't been registered yet).
DEFAULT_MODEL = MODEL_FLASH_LITE

TASK_MODELS: dict[AITask, str] = {
    AITask.URL_IMPORT: MODEL_PRO,
    AITask.IMAGE_IMPORT: MODEL_PRO,
    AITask.RECIPE_GENERATE: MODEL_PRO,
    AITask.MEAL_SUGGESTIONS: MODEL_FLASH_LITE,
}


def get_model(call_type: str) -> str:
    """Resolve the Gemini model for a given call_type string.

    Falls back to DEFAULT_MODEL when call_type isn't a known AITask.
    """
    try:
        task = AITask(call_type)
    except ValueError:
        return DEFAULT_MODEL
    return TASK_MODELS[task]


# --- Prompt templates ---

IMPORT_PROMPT_TEMPLATE = (
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

GENERATE_PROMPT_TEMPLATE = (
    "Create a complete, detailed recipe for: {title}\n\n"
    "Return all fields including ingredients with quantities and units, numbered steps, "
    "prep/cook/waiting times in minutes, servings, a short description, and appropriate tags. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)

IMAGE_IMPORT_PROMPT_TEMPLATE = """Extract the recipe from the provided image into structured JSON.

The image may be:
- A photograph of a cookbook page
- A handwritten recipe card
- A screenshot of a recipe website
- A partial or blurry image (do your best to extract what is visible)

Extract all visible recipe information: title, description, ingredients with quantities and units, \
numbered steps, servings, prep/cook/waiting times in minutes. \
For tags, only use values from this exact list: \
vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, \
low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, \
spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, \
italian, mexican, japanese, chinese, indian, thai, french, greek, \
middle-eastern, american, korean.

If some fields are unclear or missing, omit them or use null. \
Return only the structured recipe data, nothing else."""

SUGGESTIONS_SYSTEM_PROMPT = """You are a meal planning assistant. Suggest meals based on the user's preferences.
Return a JSON object with a "suggestions" array. Each suggestion must have:
- "title": the meal name (string)
- "matched_recipe_id": UUID string if the meal matches a recipe in the user's collection, or null

IMPORTANT: For collection recipes, use the EXACT title from the provided list and include the exact recipe ID.
For new ideas not in the collection, set matched_recipe_id to null."""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_ai_config.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/ai_config.py backend/tests/unit/test_ai_config.py
git commit -m "feat: add per-task Gemini model registry and prompt templates"
```

---

### Task 2: Wire `ai_service.py` to use `ai_config` for models and prompts

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Test: `backend/tests/unit/test_ai_service.py`, `backend/tests/unit/test_ai_service_image.py` (existing — must still pass unmodified)

**Interfaces:**
- Consumes: `app.core.ai_config.get_model(call_type: str) -> str`, `ai_config.IMPORT_PROMPT_TEMPLATE`, `ai_config.GENERATE_PROMPT_TEMPLATE`, `ai_config.IMAGE_IMPORT_PROMPT_TEMPLATE`, `ai_config.SUGGESTIONS_SYSTEM_PROMPT` (all from Task 1).
- Produces: no change to any public function signature in `ai_service.py`.

- [ ] **Step 1: Write a new test asserting the resolved model is passed to Gemini per call type**

Add to `backend/tests/unit/test_ai_service.py` (append at end of file):

```python
@pytest.mark.asyncio
async def test_import_recipe_from_url_uses_pro_model():
    from app.core.ai_config import MODEL_PRO

    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    with patch("app.services.ai_service._client", mock_client):
        await import_recipe_from_url("https://example.com/pasta")
    call_kwargs = mock_client.aio.models.generate_content.call_args
    assert call_kwargs.kwargs.get("model") == MODEL_PRO
```

Add a new test file `backend/tests/unit/test_ai_service_meal_suggestions.py`:

```python
# backend/tests/unit/test_ai_service_meal_suggestions.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.ai_config import MODEL_FLASH_LITE
from app.schemas.ai_responses import MealSuggestionResult
from app.services.ai_service import generate_meal_suggestions

_VALID_RESULT = MealSuggestionResult(suggestions=[])


def _make_mock_client(response_text: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = response_text
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_generate_meal_suggestions_uses_flash_lite_model():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    with patch("app.services.ai_service._client", mock_client):
        await generate_meal_suggestions(
            meal_types=["dinner"],
            days_ahead=1,
            dietary_restrictions=[],
            allergies=[],
            favorite_cuisines=[],
            disliked_ingredients=[],
            meal_plan_system_prompt=None,
            recipe_collection=[],
            steer_prompt=None,
            carryover_titles=[],
        )
    call_kwargs = mock_client.aio.models.generate_content.call_args
    assert call_kwargs.kwargs.get("model") == MODEL_FLASH_LITE
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/unit/test_ai_service.py::test_import_recipe_from_url_uses_pro_model tests/unit/test_ai_service_meal_suggestions.py -v`
Expected: FAIL — both assert `MODEL_PRO`/`MODEL_FLASH_LITE` but `ai_service.py` still passes `settings.AI_MODEL` (`"gemini-3.1-pro-preview"` for the first, which will coincidentally pass; the meal-suggestions one fails because `settings.AI_MODEL` is Pro, not Flash Lite). Confirm the meal-suggestions test fails with an assertion error on the model string.

- [ ] **Step 3: Edit `ai_service.py` to import `ai_config` and remove inlined prompt constants**

Read the current file first:

```bash
sed -n '1,65p' backend/app/services/ai_service.py
```

Replace the import block and remove the four prompt constants. Change:

```python
from app.core.config import settings
from app.schemas.ai_responses import MealSuggestionResult, RecipeImportResult

_T = TypeVar("_T")

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

_GENERATE_PROMPT_TEMPLATE = (
    "Create a complete, detailed recipe for: {title}\n\n"
    "Return all fields including ingredients with quantities and units, numbered steps, "
    "prep/cook/waiting times in minutes, servings, a short description, and appropriate tags. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)

_IMAGE_IMPORT_PROMPT_TEMPLATE = """Extract the recipe from the provided image into structured JSON.

The image may be:
- A photograph of a cookbook page
- A handwritten recipe card
- A screenshot of a recipe website
- A partial or blurry image (do your best to extract what is visible)

Extract all visible recipe information: title, description, ingredients with quantities and units, \
numbered steps, servings, prep/cook/waiting times in minutes. \
For tags, only use values from this exact list: \
vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, \
low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, \
spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, \
italian, mexican, japanese, chinese, indian, thai, french, greek, \
middle-eastern, american, korean.

If some fields are unclear or missing, omit them or use null. \
Return only the structured recipe data, nothing else."""
```

to:

```python
from app.core import ai_config
from app.core.config import settings
from app.schemas.ai_responses import MealSuggestionResult, RecipeImportResult

_T = TypeVar("_T")

logger = logging.getLogger(__name__)

_client: genai.Client | None = None
```

- [ ] **Step 4: Update the three prompt-template use sites**

In `import_recipe_from_url` (currently `prompt = _IMPORT_PROMPT_TEMPLATE.format(url=url)`):

```python
    prompt = ai_config.IMPORT_PROMPT_TEMPLATE.format(url=url)
```

In `import_recipe_from_image` (currently `contents=[_IMAGE_IMPORT_PROMPT_TEMPLATE, image_part]`):

```python
                    contents=[ai_config.IMAGE_IMPORT_PROMPT_TEMPLATE, image_part],
```

In `generate_recipe_from_title` (currently `prompt = _GENERATE_PROMPT_TEMPLATE.format(title=title)`):

```python
    prompt = ai_config.GENERATE_PROMPT_TEMPLATE.format(title=title)
```

Near the bottom of the file (currently `_SUGGESTIONS_SYSTEM_PROMPT = """..."""` module-level constant before `_build_suggestions_prompt`): delete that constant entirely, and in `generate_meal_suggestions`, change:

```python
    full_prompt = f"{_SUGGESTIONS_SYSTEM_PROMPT}\n\n{prompt}"
```

to:

```python
    full_prompt = f"{ai_config.SUGGESTIONS_SYSTEM_PROMPT}\n\n{prompt}"
```

- [ ] **Step 5: Replace `model=settings.AI_MODEL` with `model=ai_config.get_model(call_type)` at all four call sites**

In `import_recipe_from_url`, the `generate_content(...)` call currently has `model=settings.AI_MODEL,`. Change to:

```python
                    model=ai_config.get_model("url_import"),
```

Also update the two `logger.info`/`logger.warning` calls and two `_write_ai_log(...)` calls in this function that reference `settings.AI_MODEL` for logging — replace each with `ai_config.get_model("url_import")` so the logged model matches what was actually sent.

In `import_recipe_from_image`, same pattern with `"image_import"`:

```python
                    model=ai_config.get_model("image_import"),
```

...and its logging/`_write_ai_log` call sites.

In `generate_recipe_from_title`, same pattern with `"recipe_generate"`:

```python
                    model=ai_config.get_model("recipe_generate"),
```

...and its logging/`_write_ai_log` call sites.

In `call_ai_structured`, which already takes `call_type: str` as a parameter, change:

```python
                    model=settings.AI_MODEL,
```

to:

```python
                    model=ai_config.get_model(call_type),
```

...and update its logging/`_write_ai_log` call sites (which currently log `settings.AI_MODEL`) to use `ai_config.get_model(call_type)` instead. Since `call_type` defaults to `"unknown"` in this function's signature and `"unknown"` is not a valid `AITask`, unregistered callers correctly resolve to `MODEL_FLASH_LITE` via the `DEFAULT_MODEL` fallback.

After this step, confirm no remaining references to `settings.AI_MODEL` exist in the file:

```bash
grep -n "settings.AI_MODEL" backend/app/services/ai_service.py
```

Expected: no output.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/unit/test_ai_service.py tests/unit/test_ai_service_image.py tests/unit/test_ai_service_meal_suggestions.py tests/unit/test_ai_config.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ai_service.py backend/tests/unit/test_ai_service.py backend/tests/unit/test_ai_service_meal_suggestions.py
git commit -m "refactor: resolve Gemini model per task via ai_config instead of settings.AI_MODEL"
```

---

### Task 3: Remove `AI_MODEL` from settings and env files, update docs

**Files:**
- Modify: `backend/app/core/config.py:17`
- Modify: `.env.example:22`
- Modify: `CLAUDE.md` (root) — "Optional env vars" list
- Modify: `backend/CLAUDE.md` — "AI Integration" → "Provider" section
- Test: `backend/tests/unit/test_ai_service.py`, `backend/tests/unit/test_ai_config.py`, full backend suite

**Interfaces:**
- Consumes: nothing new.
- Produces: `Settings` (in `app.core.config`) no longer has an `AI_MODEL` field.

- [ ] **Step 1: Remove `AI_MODEL` from `Settings`**

In `backend/app/core/config.py`, remove this line:

```python
    AI_MODEL: str = "gemini-3.1-pro-preview"
```

so the "Optional with defaults" block reads:

```python
    # Optional with defaults
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AI_TIMEOUT_SECONDS: int = 60
    AI_MAX_RETRIES: int = 3
    AI_CALL_BUDGET_DEFAULT: int = 300
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    APP_LOG_FILE: str = "/tmp/secretsauce/app.log"
```

- [ ] **Step 2: Confirm no remaining code references to `settings.AI_MODEL` anywhere in the backend**

```bash
grep -rn "AI_MODEL" backend/app --include="*.py"
```

Expected: no output (Task 2 already removed all usages in `ai_service.py`; this step catches any other file).

- [ ] **Step 3: Remove `AI_MODEL` line from `.env.example`**

In `.env.example`, remove:

```
# AI_MODEL=gemini-2.5-pro-preview
```

so the "Optional — defaults shown" block reads:

```
# Optional — defaults shown
# ACCESS_TOKEN_EXPIRE_MINUTES=30
# REFRESH_TOKEN_EXPIRE_DAYS=7
# AI_TIMEOUT_SECONDS=60
# AI_MAX_RETRIES=3
# DB_POOL_SIZE=10
# DB_MAX_OVERFLOW=20
```

- [ ] **Step 4: Update root `CLAUDE.md` "Optional env vars" list**

Find the block under `## Configuration`:

```
Optional env vars with defaults:
```
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AI_MODEL=gemini-3.1-pro-preview
AI_TIMEOUT_SECONDS=60
AI_MAX_RETRIES=3
AI_CALL_BUDGET_DEFAULT=300
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```
```

Remove the `AI_MODEL=gemini-3.1-pro-preview` line so it reads:

```
Optional env vars with defaults:
```
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AI_TIMEOUT_SECONDS=60
AI_MAX_RETRIES=3
AI_CALL_BUDGET_DEFAULT=300
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```
```

- [ ] **Step 5: Update `backend/CLAUDE.md` "AI Integration" → "Provider" section**

Find this section:

```markdown
### Provider
Google Gemini via the `google-genai` Python SDK. Do NOT use the `openai` package, `openrouter`, or `instructor` library.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=settings.GEMINI_API_KEY)
```

The shared client lives in `app/services/ai_service.py` as a module-level singleton (`_client`). Use `client.aio` for all async calls.
```

Replace with:

```markdown
### Provider
Google Gemini via the `google-genai` Python SDK. Do NOT use the `openai` package, `openrouter`, or `instructor` library.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=settings.GEMINI_API_KEY)
```

The shared client lives in `app/services/ai_service.py` as a module-level singleton (`_client`). Use `client.aio` for all async calls.

### Model & Prompt Config
Which Gemini model handles each AI task, and the prompt template sent for that task, are
defined in `app/core/ai_config.py` — review or edit that file, not `ai_service.py`, when
changing model choice or prompt wording. Call sites resolve their model via
`ai_config.get_model(call_type)`; a `call_type` not registered in `ai_config.TASK_MODELS`
falls back to the cheaper default model.
```

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && pytest --cov=app --cov-report=term-missing`
Expected: all tests PASS, no failures related to `AI_MODEL`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/config.py .env.example CLAUDE.md backend/CLAUDE.md
git commit -m "docs: remove AI_MODEL env var, point to ai_config.py for model/prompt config"
```

---

## Final Verification

- [ ] Run `grep -rn "AI_MODEL" backend/ .env.example CLAUDE.md` from the repo root — expect zero matches.
- [ ] Run `cd backend && pytest --cov=app --cov-report=term-missing` — full suite passes.
- [ ] Manually inspect `app/core/ai_config.py` — confirm `url_import`, `image_import`, `recipe_generate` map to `gemini-3.1-pro-preview` and `meal_suggestions` maps to `gemini-3.1-flash-lite`.
