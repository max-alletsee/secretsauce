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
OpenRouter native Python SDK (`openrouter` package, installed via `uv add openrouter`). Do NOT use the `openai` package or `instructor` library.

```python
from openrouter import AsyncOpenRouter

client = AsyncOpenRouter(api_key=settings.OPENROUTER_API_KEY)
```

### Structured Outputs
All AI calls use OpenRouter's native `response_format` with JSON schema derived from Pydantic models. Define expected output schemas in `app/schemas/ai_responses.py`.

```python
from openrouter import AsyncOpenRouter

async def call_ai_structured(
    messages: list[dict],
    response_model: type[BaseModel],
    model: str = settings.AI_MODEL,
) -> BaseModel:
    response = await client.chat.send_async(
        model=model,
        messages=messages,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": response_model.__name__,
                "schema": response_model.model_json_schema(),
                "strict": True,
            },
        },
    )
    return response_model.model_validate_json(response.choices[0].message.content)
```

### Fallback and Error Handling
- Wrap all AI calls in try/except with retries (max 3 attempts with exponential backoff).
- If structured output parsing fails after retries, save the raw response and flag the import as `needs_review` for the user to manually fix.
- Set timeout of 60 seconds per AI call.
- Log all AI calls with model used, token count, latency, and success/failure.

### Recipe Import Pipeline
1. User submits a URL or uploads an image.
2. Endpoint returns 202 Accepted with a task ID.
3. BackgroundTask fetches the URL content (via httpx) or processes the image (base64-encode for AI).
4. AI call extracts recipe data into `RecipeImportResponse` Pydantic model.
5. Validation: check all required fields are present and sensible (e.g., prep_time > 0, ingredients list non-empty).
6. If valid, create recipe in draft state. User reviews and confirms.
7. If invalid or AI extraction fails, mark as `needs_review` with the partial data and raw source.
8. Uploaded images are stored temporarily in `UPLOAD_DIR` (configured via env var, default `/tmp/secretsauce-uploads/`). A daily cleanup task deletes files older than 24 hours. Only the resulting database entry is kept.

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
- **AI mocking:** All AI service calls are mocked in tests. Never make real OpenRouter calls in tests. Use `unittest.mock.patch` on the instructor client.
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
