# Backend — CLAUDE.md

This file covers backend-specific implementation conventions. For project overview, data model, API contract, and deployment, see the root `CLAUDE.md`.

## Architecture

Use FastAPI's dependency injection (`Depends()`) for auth, database sessions, and shared validation logic. All async — use `async def` for route handlers, async SQLAlchemy sessions, and async httpx for external calls.

### Directory Responsibilities

- **`api/routes/`** — Thin route handlers. Validate input, call a service, return response. One file per domain.
- **`api/deps.py`** — Shared dependencies: `get_db` (async session), `get_current_user`, `get_current_superuser`.
- **`models/`** — SQLModel table definitions. One file per domain. No business logic.
- **`schemas/`** — Pydantic models for API input/output. Separate `Create`, `Update`, `Response` models per domain. Also `schemas/ai_responses.py` for AI structured output models.
- **`services/`** — All business logic. AI calls, recipe import parsing, meal plan generation, shopping list aggregation. Services receive database sessions and user context as arguments.
- **`core/`** — Config, security, database setup, constants/enums.
- **`tasks/`** — Background task functions called via FastAPI `BackgroundTasks`.

## Authentication

Use fastapi-users with JWT strategy:
- Short-lived access tokens (30 minutes).
- Refresh tokens (7 days).
- OAuth providers: Google, Apple, Facebook — configured via fastapi-users OAuth routers.
- Password hashing via bcrypt (fastapi-users default).
- All auth routes at `/api/v1/auth/`.
- Protected routes use `Depends(current_active_user)` from fastapi-users.
- Admin routes additionally use `Depends(current_superuser)`.

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

### Meal Plan Generation
1. Build system prompt from: user preferences (dietary restrictions, allergies, cuisines, disliked ingredients, default servings), the user's custom `meal_plan_system_prompt`, and unresolved carryover meals.
2. User prompt includes: date range, constraints for this plan (e.g., "at least 4 vegetarian dinners"), and which slots to fill.
3. AI returns structured suggestions: `[{date, meal_type, recipe_id, reasoning}]`, referencing recipes from the user's collection.
4. User reviews suggestions, accepts/rejects per slot, and can re-trigger generation for unfilled slots.
5. Accepted suggestions become MealPlanEntry rows with `source=ai_suggested`.

## Background Tasks

Use FastAPI's built-in `BackgroundTasks` for:
- Recipe import (URL fetch + AI extraction)
- Recipe import (image processing + AI extraction)
- Meal plan AI generation
- Daily cleanup of expired temp upload files

Pattern for all background tasks:
```python
@router.post("/recipes/import/url", status_code=202)
async def import_recipe_from_url(
    payload: RecipeImportURLRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await create_import_task(db, user.id, payload.url)
    background_tasks.add_task(process_url_import, task.id, payload.url, user.id)
    return {"task_id": task.id, "status": "processing"}
```

If the app grows beyond what BackgroundTasks can handle (e.g., need task queues, retries, monitoring), migrate to Celery + Redis. The service layer doesn't change — only the task dispatch mechanism.

## Database & Migrations

- Use async SQLAlchemy with asyncpg driver.
- Connection string format: `postgresql+asyncpg://user:pass@host:port/dbname`
- Connection pooling: pool_size=10, max_overflow=20 (configurable via env vars).
- All schema changes go through Alembic migrations. Never modify tables manually.
- Migration workflow:
  ```bash
  # After changing models
  alembic revision --autogenerate -m "description of change"
  # Review the generated migration, then apply
  alembic upgrade head
  ```

## Testing

### Strategy

- **Test database:** Use a separate PostgreSQL database (configured in docker-compose.test.yml). Create/drop tables per test session, not per test.
- **Fixed test data:** Seed data lives in `tests/fixtures/` as JSON files (users.json, recipes.json, meal_plans.json). Load via fixtures in conftest.py.
- **AI mocking:** All AI service calls are mocked in tests. Never make real Gemini calls in tests. Use `unittest.mock.patch` on `app.services.ai_service._client` (the module-level Gemini client singleton).
- **Test client:** Use FastAPI's `TestClient` (sync) or `httpx.AsyncClient` for async route tests.
- **Coverage target:** 80%+ line coverage on services and routes.

### Structure

```
tests/
├── unit/
│   ├── test_recipe_import_service.py    # Test parsing, validation logic
│   ├── test_meal_planner_service.py     # Test prompt building, response handling
│   └── test_shopping_service.py         # Test ingredient aggregation
├── integration/
│   ├── test_recipe_routes.py            # Full CRUD through API
│   ├── test_meal_plan_routes.py         # Plan creation, entry management
│   ├── test_auth_routes.py              # Login, register, token refresh
│   └── test_import_routes.py            # Import endpoints (mocked AI)
├── fixtures/
│   ├── users.json
│   ├── recipes.json
│   └── meal_plans.json
└── conftest.py
```

### Running Tests

```bash
pytest --cov=app --cov-report=term-missing
```

Always run tests after making code changes. Tests must pass before committing.
