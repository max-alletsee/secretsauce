# Phase 3: Recipe Import from URL — Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Scope:** URL-based recipe import using Gemini API with URLContext and structured outputs; Gemini replaces OpenRouter as the project-wide AI provider
**Blocked by:** Phase 2 (Recipe CRUD & Versioning) — complete

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI provider | Gemini (replaces OpenRouter entirely) | URLContext allows passing a URL directly to Gemini — it fetches and reads the page itself, eliminating the need for a separate httpx fetch step |
| Gemini structured outputs | `response_schema` with Pydantic model | Native Gemini SDK feature; no third-party library (instructor etc.) needed |
| Default model | `gemini-3.1-pro-preview` | Most capable Gemini model; overridable via `AI_MODEL` env var |
| Import task tracking | DB table (`import_task`) | Survives container restarts, OOM kills, and deploys; enables future import history |
| Async pattern | 202 + polling (`GET /import-tasks/{task_id}` every 3s) | Fits FastAPI BackgroundTasks; Gemini calls take 5–15s — too long to hold open HTTP connection |
| Image import | Deferred to Phase 3b | URL import first; image import follows in a separate phase |
| Import entry point | Inline in RecipeListView | No new route needed; URL input + spinner + navigation on completion |
| Imported recipe state | Created as `private` | User reviews and confirms via RecipeEditView before sharing |
| Rate limit | 100 requests/hour per user | Generous for enthusiast home cooks; protects Gemini API costs |

---

## Provider Swap: OpenRouter → Gemini

### Dependencies (`backend/pyproject.toml`)

- Remove: `openrouter`
- Add: `google-genai`

### Config (`app/core/config.py`)

- Remove: `OPENROUTER_API_KEY`
- Add: `GEMINI_API_KEY: str`
- Change: `AI_MODEL: str = "gemini-3.1-pro-preview"`

### AI service (`app/services/ai_service.py`) — new file

Single module holding the shared async Gemini client and two public functions:

**`import_recipe_from_url(url: str) -> RecipeImportResult`**
- Uses Gemini URLContext tool: passes `url` directly to the model — Gemini fetches and reads the page
- Uses `response_schema=RecipeImportResult` for structured output
- Wrapped in retry logic (max 3 attempts, exponential backoff)
- Raises `AIServiceError` on permanent failure

**`call_ai_structured(prompt: str, response_model: type[BaseModel]) -> BaseModel`**
- General-purpose structured call for future features (meal planning etc.)
- Uses `response_schema` derived from the provided Pydantic model

Both functions:
- Set 60-second timeout
- Log model used, token count, latency, and success/failure

### CLAUDE.md updates

- `backend/CLAUDE.md` AI Integration section: replace OpenRouter pattern with Gemini SDK pattern, document URLContext usage and `response_schema` structured outputs
- Root `CLAUDE.md` config env vars table: replace `OPENROUTER_API_KEY` with `GEMINI_API_KEY`

---

## Data Model

### ImportTask (`app/models/import_task.py`) — new file

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID (FK → User) | Owner |
| `url` | str | The submitted URL |
| `status` | Enum: `pending` \| `processing` \| `completed` \| `failed` | |
| `recipe_id` | UUID (FK → Recipe), nullable | Set on success |
| `error_message` | str, nullable | Set on failure |
| `created_at` | datetime (UTC) | |
| `updated_at` | datetime (UTC) | Updated on every status transition |

**Index:** `user_id` — for future import history queries.

### Alembic Migration

Single migration adding the `import_task` table with all fields, foreign keys, and the `user_id` index.

---

## Backend

### AI Response Schema (`app/schemas/ai_responses.py`) — new file

`RecipeImportResult` Pydantic model — the `response_schema` passed to Gemini:

```python
class ImportedIngredient(BaseModel):
    name: str
    quantity: float | None
    unit: str | None

class ImportedStep(BaseModel):
    order: int
    instruction: str

class ImportedRecipeSource(BaseModel):
    type: Literal["url"]
    url: str

class RecipeImportResult(BaseModel):
    title: str
    description: str | None
    ingredients: list[ImportedIngredient]
    steps: list[ImportedStep]
    servings: int | None
    prep_time_minutes: int | None
    waiting_time_minutes: int | None
    cook_time_minutes: int | None
    tags: list[str]  # validated against pre-built constants after extraction
    recipe_source: ImportedRecipeSource
```

### Import Service (`app/services/recipe_import_service.py`) — new file

**`async def process_url_import(task_id: UUID, url: str, user_id: UUID)`**

Background tasks run after the request/response cycle — the request-scoped DB session is closed by then. This function creates its own `AsyncSession` using the session factory from `app/core/database.py`.

1. Open a new `AsyncSession`
2. Fetch `ImportTask` from DB, set `status → processing`, `updated_at`
3. Fetch `User` by `user_id` (needed by `recipe_service.create_recipe`)
4. Call `ai_service.import_recipe_from_url(url)` → `RecipeImportResult`
5. Validate: non-empty `title`, at least 1 ingredient, at least 1 step
6. Filter `tags` to pre-built constants only (drop unknown tags silently)
7. Call `recipe_service.create_recipe(db, user, data)` → persists as `private` recipe
8. Set `status → completed`, `recipe_id`, `updated_at`
9. On any exception: set `status → failed`, `error_message`, `updated_at`

### Schemas (`app/schemas/import_task.py`) — new file

- `RecipeImportURLRequest`: `{url: AnyHttpUrl}`
- `ImportTaskRead`: `{id, status, recipe_id, error_message, created_at, updated_at}` — `user_id` excluded

### Routes (`app/api/routes/import_tasks.py`) — new file

All routes require `current_active_user` dependency.

| Method | Path | Status | Response |
|--------|------|--------|----------|
| `POST` | `/api/v1/recipes/import/url` | 202 | `{task_id, status: "pending"}` |
| `GET` | `/api/v1/import-tasks/{task_id}` | 200 | `ImportTaskRead` |

**POST `/api/v1/recipes/import/url`:**
- Validates `url` as `AnyHttpUrl`
- Creates `ImportTask` row (`status=pending`)
- Fires `BackgroundTask(process_url_import, task.id, url, user.id)` — no DB session passed; task creates its own
- Returns `{task_id: task.id, status: "pending"}`
- Rate limited: 100 requests/hour per user

**GET `/api/v1/import-tasks/{task_id}`:**
- Returns `ImportTaskRead`
- 404 if task not found **or** task belongs to a different user (prevents leaking task existence)

### Error Responses

| Error Code | HTTP Status | When |
|------------|-------------|------|
| `IMPORT_TASK_NOT_FOUND` | 404 | Task doesn't exist or belongs to another user |
| `IMPORT_INVALID_URL` | 422 | URL fails `AnyHttpUrl` validation |

---

## Frontend

### Types (`src/types/importTask.ts`) — new file

```typescript
interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}
```

### API (`src/api/importTasks.ts`) — new file

- `importRecipeFromUrl(url: string)` → `{task_id: string, status: string}`
- `getImportTask(taskId: string)` → `ImportTask`

### Import flow (added to `RecipeListView`)

A URL input field + "Import" button added to the existing recipe list view. No new route.

**State (local `ref`s, not store):**
- `importUrl: ref<string>`
- `importTaskId: ref<string | null>`
- `importStatus: ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>`
- `importError: ref<string | null>`
- `pollInterval: ref<ReturnType<typeof setInterval> | null>`

**Flow:**
1. User enters URL, clicks "Import"
2. Call `importRecipeFromUrl(url)` → set `importTaskId`, `importStatus = 'pending'`
3. Show inline loading state: "Importing recipe…" with spinner; input + button disabled
4. Start `setInterval` polling `getImportTask(importTaskId)` every 3 seconds
5. On `completed` → clear interval, navigate to `/recipes/:recipe_id/edit`
6. On `failed` → clear interval, show `importError` message, re-enable input for retry
7. Clear interval on component unmount (`onUnmounted`)

---

## Testing

### Backend Unit Tests (`tests/unit/test_recipe_import_service.py`)

- Happy path — Gemini returns valid `RecipeImportResult` → recipe created, status `completed`, `recipe_id` set
- Gemini failure — `AIServiceError` raised → status `failed`, `error_message` set
- Validation failure — Gemini returns result with empty ingredients → status `failed`
- Unknown tags filtered — tags not in pre-built set are silently dropped, import still completes

### Backend Integration Tests (`tests/integration/test_import_routes.py`)

All Gemini calls mocked via `unittest.mock.patch` on `ai_service.import_recipe_from_url`.

- `POST /recipes/import/url` authenticated → 202, `ImportTask` row in DB with `status=pending`
- `POST /recipes/import/url` unauthenticated → 401
- `GET /import-tasks/{task_id}` owner → 200 with task data
- `GET /import-tasks/{task_id}` non-owner → 404
- Full polling cycle — submit → mock Gemini completes → poll → status `completed`, `recipe_id` present, recipe exists in DB with `status=private`

### Frontend Unit Tests (`src/views/RecipeListView.test.ts`)

- Submit URL → shows spinner, import button disabled
- Poll `completed` → navigates to `/recipes/:id/edit`
- Poll `failed` → shows error message, re-enables input

---

## Out of Scope

- Image import (Phase 3b)
- Import history / list of past import tasks
- Re-triggering a failed import (user re-submits URL manually)
- Public URL imports (unauthenticated)
