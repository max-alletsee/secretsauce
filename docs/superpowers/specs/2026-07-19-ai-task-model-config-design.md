# Per-Task Gemini Model & Prompt Config — Design

**Date:** 2026-07-19
**Status:** Approved design, implementation pending

## Problem

All Gemini calls in `app/services/ai_service.py` share one model, `settings.AI_MODEL`
(env var, currently `gemini-3.1-pro-preview`). Recipe import/generation and meal-plan
suggestions have different cost/quality tradeoffs — import work is higher-stakes
structured extraction and benefits from Pro; meal suggestions are lighter classification
over a known recipe collection and don't need it. There's also no single place to review
or edit the four AI prompt templates — they're scattered as module-level constants
inside `ai_service.py` alongside the call logic.

We want one file that maps AI task → model, and holds all prompt templates, so both can
be reviewed and changed without touching call/retry logic.

## Decisions

| Question | Decision |
|---|---|
| Task → model mapping | `url_import`, `image_import`, `recipe_generate` → **Pro** (`gemini-3.1-pro-preview`). `meal_suggestions` → **Flash Lite** (`gemini-3.1-flash-lite`). |
| New file location | `app/core/ai_config.py` — next to `config.py`, since this is configuration, not business logic. |
| Unregistered `call_type` | `call_ai_structured(call_type=...)` is documented as the general entry point for future AI features. Any `call_type` not in the registry falls back to **Flash Lite** (the cheaper default) rather than erroring. |
| `AI_MODEL` env var | **Removed** from `config.py` and `.env`. Model choice lives entirely in `ai_config.py` — no env override. |
| `AI_TIMEOUT_SECONDS` / `AI_MAX_RETRIES` | Unchanged — stay global in `config.py`, not per-task. |
| Prompts | The four existing prompt templates (`_IMPORT_PROMPT_TEMPLATE`, `_GENERATE_PROMPT_TEMPLATE`, `_IMAGE_IMPORT_PROMPT_TEMPLATE`, `_SUGGESTIONS_SYSTEM_PROMPT`) move from `ai_service.py` into `ai_config.py` verbatim (unexported, no wording changes). |

## `app/core/ai_config.py`

```python
from enum import Enum


class AITask(str, Enum):
    URL_IMPORT = "url_import"
    IMAGE_IMPORT = "image_import"
    RECIPE_GENERATE = "recipe_generate"
    MEAL_SUGGESTIONS = "meal_suggestions"


MODEL_PRO = "gemini-3.1-pro-preview"
MODEL_FLASH_LITE = "gemini-3.1-flash-lite"

# Default model for any call_type not listed below (e.g. future call_ai_structured callers).
DEFAULT_MODEL = MODEL_FLASH_LITE

TASK_MODELS: dict[AITask, str] = {
    AITask.URL_IMPORT: MODEL_PRO,
    AITask.IMAGE_IMPORT: MODEL_PRO,
    AITask.RECIPE_GENERATE: MODEL_PRO,
    AITask.MEAL_SUGGESTIONS: MODEL_FLASH_LITE,
}


def get_model(call_type: str) -> str:
    """Resolve the Gemini model for a given call_type string.

    Falls back to DEFAULT_MODEL for any call_type not in TASK_MODELS
    (covers unregistered call_ai_structured callers).
    """
    try:
        task = AITask(call_type)
    except ValueError:
        return DEFAULT_MODEL
    return TASK_MODELS[task]


# --- Prompt templates ---

IMPORT_PROMPT_TEMPLATE = (...)          # moved from ai_service.py, unchanged
GENERATE_PROMPT_TEMPLATE = (...)        # moved from ai_service.py, unchanged
IMAGE_IMPORT_PROMPT_TEMPLATE = """...""" # moved from ai_service.py, unchanged
SUGGESTIONS_SYSTEM_PROMPT = """...""" # moved from ai_service.py, unchanged
```

## Changes to `app/services/ai_service.py`

- Import `ai_config` from `app.core`.
- Delete the four inlined prompt constants; reference `ai_config.IMPORT_PROMPT_TEMPLATE`
  etc. at their existing use sites instead.
- In each of the four call sites, replace `model=settings.AI_MODEL` with
  `model=ai_config.get_model(call_type)`:
  - `import_recipe_from_url` → `call_type="url_import"`
  - `import_recipe_from_image` → `call_type="image_import"`
  - `generate_recipe_from_title` → `call_type="recipe_generate"`
  - `call_ai_structured` → uses its existing `call_type` parameter (already passed
    through by `generate_meal_suggestions` as `"meal_suggestions"`)
- No signature changes to any public function — `call_type` strings already exist at
  every call site today (used for `AICallLog.call_type`), so this is a pure lookup swap.

## Other touch points

- `app/core/config.py`: remove `AI_MODEL: str = "gemini-3.1-pro-preview"`.
- `.env` / `.env.example` (wherever maintained): remove `AI_MODEL` line.
- Root `CLAUDE.md`: remove `AI_MODEL=gemini-3.1-pro-preview` from the "Optional env vars"
  list.
- `backend/CLAUDE.md`: in the "AI Integration" section, add a pointer that per-task model
  selection and prompt templates live in `app/core/ai_config.py`, resolved via
  `ai_config.get_model(call_type)`.

## Testing

- Existing tests mock `app.services.ai_service._client` (the Gemini client singleton),
  not `settings.AI_MODEL`, so no test should break from this change.
- Add a small unit test for `ai_config.get_model()`: each of the four known call_types
  resolves to the expected model; an unknown call_type resolves to `MODEL_FLASH_LITE`.
- Run `pytest --cov=app --cov-report=term-missing` after the change to confirm nothing
  regressed.

## Out of scope

- No changes to retry/timeout logic, logging, or `AICallLog` schema.
- No per-task timeout or retry override — only model and prompt move into the new file.
- No env-var override for per-task models — this is intentionally code-only so it stays
  easy to review in one file, per the user's request.
