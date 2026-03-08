# Mealtime Flow — MVP Implementation Plan

## Overview

Greenfield build of a recipe management and meal planning web app. 19 tasks across 9 phases (+ testing/polish), ordered by dependency. Backend (FastAPI/PostgreSQL) and frontend (Vue 3/TypeScript) built sequentially in Phase 0, then parallelized where possible.

### Key Tooling Decisions
- **Backend package manager:** uv (Rust-based, lockfile support)
- **Frontend package manager:** pnpm
- **Frontend UI library:** PrimeVue (unstyled mode — we control all styling)
- **Local dev database:** Postgres via Docker (`docker-compose.dev.yml` runs only Postgres)
- **Dev workflow:** Backend + frontend run natively on host; Postgres in Docker
- **App structure:** Module-level `app = FastAPI(...)` (not factory function)
- **Phase 0 approach:** Sequential with verified checkpoints (backend → frontend → Docker)

---

## Phase 0: Project Scaffolding & Infrastructure

### Task #1 — Backend project scaffolding
**Status:** Ready (no blockers)

**Setup:**
- `uv init` in `backend/`, Python 3.12+ target
- `pyproject.toml` with grouped dependencies:
  - Core: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, sqlmodel, alembic, pydantic-settings, httpx, python-multipart
  - Auth: fastapi-users[sqlalchemy], bcrypt, cryptography
  - AI / OpenRouter: instructor, openai (used as OpenAI-compatible HTTP client for OpenRouter API)
  - Rate limiting: slowapi
  - Dev: ruff, mypy, pytest, pytest-cov, pytest-asyncio
- `uv.lock` committed for reproducible installs

**App structure:**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # app = FastAPI(...), CORS, router includes, lifespan events
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py          # get_db (async session generator)
│   │   └── routes/
│   │       ├── __init__.py
│   │       └── health.py    # GET /health with DB connectivity check
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py        # Settings(BaseSettings) — all env vars
│   │   ├── database.py      # async engine, async_sessionmaker, Base
│   │   └── constants.py     # enums + tag lists (empty structure, ready for Phase 1)
│   ├── models/
│   │   └── __init__.py
│   ├── schemas/
│   │   └── __init__.py
│   ├── services/
│   │   └── __init__.py
│   └── tasks/
│       └── __init__.py
├── alembic/
│   ├── env.py               # configured for async SQLAlchemy + SQLModel metadata
│   ├── script.py.mako
│   └── versions/
├── alembic.ini
├── pyproject.toml
└── uv.lock
```

**Key details:**
- Module-level `app = FastAPI(...)`, not factory function
- `GET /health` returns `{"status": "ok", "db": "connected"}` via `SELECT 1`; returns 503 with `{"status": "error", "db": "disconnected"}` if DB unreachable
- Pydantic Settings reads env vars with `.env` file support (all vars from CLAUDE.md spec)
- Use FastAPI `lifespan` context manager (not deprecated `on_event`) — skeleton only
- Create `backend/Dockerfile`

### Task #2 — Frontend project scaffolding
**Status:** Ready (no blockers)

**Setup:**
- `pnpm create vue@latest` with TypeScript, Vue Router, Pinia presets
- Add dependencies: axios, vuedraggable, primevue (unstyled mode)
- Add dev dependencies: vitest, @vue/test-utils, @playwright/test, eslint, prettier
- `pnpm-lock.yaml` committed

**App structure:**
```
frontend/
├── src/
│   ├── App.vue               # root component, PrimeVue provider
│   ├── main.ts               # createApp, install router/pinia/primevue
│   ├── views/
│   │   └── HomeView.vue      # placeholder page, calls GET /api/v1/health to verify proxy
│   ├── components/           # empty, ready for Phase 2
│   ├── composables/          # empty
│   ├── stores/
│   │   └── useUserStore.ts   # skeleton: isAuthenticated, isSuperuser (hardcoded false)
│   ├── api/
│   │   └── client.ts         # axios instance, baseURL /api/v1, auth + 401 interceptor skeletons
│   ├── router/
│   │   └── index.ts          # routes: / → HomeView, auth guard skeleton (inactive until Phase 1)
│   ├── types/                # empty, ready for Phase 1
│   └── assets/
│       └── main.css          # CSS reset via PrimeVue, base variables, mobile-first defaults
├── e2e/                      # empty, ready for Phase 10
├── index.html
├── vite.config.ts            # proxy: /api → http://localhost:8000
├── tsconfig.json             # paths: @/ → src/
├── package.json
└── pnpm-lock.yaml
```

**Key details:**
- PrimeVue unstyled mode enabled globally — no preset theme, all styling via scoped CSS
- PrimeVue components imported individually (tree-shakeable), not globally registered
- Vite proxy: `/api` → `http://localhost:8000` for dev (no CORS issues)
- HomeView calls `GET /api/v1/health` on mount and displays status — proves frontend-to-backend wiring
- Create `frontend/Dockerfile`

### Task #3 — Docker Compose & Nginx setup
**Status:** Ready (no blockers)

**Three compose files:**

**`docker-compose.dev.yml`** — local development, Postgres only:
- postgres:16 on port 5432, user/pass/db = mealtime
- Volume for data persistence, healthcheck with pg_isready
- Backend + frontend run natively on host (not containerized in dev)

**`docker-compose.yml`** — production with all four services:
- backend, frontend, postgres, nginx as spec'd in CLAUDE.md
- Backend and frontend each have a Dockerfile
- Postgres with persistent volume + healthcheck
- Nginx on ports 80/443

**`docker-compose.test.yml`** — test environment:
- Same as production but with separate `mealtime_test` database
- No Nginx, ports exposed directly for test runners

**Nginx (`nginx/nginx.conf`):**
- `/api/` → proxy to `backend:8000`
- `/` → serve frontend static build (or proxy to frontend container)
- TLS termination config (placeholder, certs from `./certs/`)
- HTTP → HTTPS redirect

**Root files:**
- `.env.example` — documented template with all required + optional env vars
- `.gitignore` — Python (__pycache__, .venv, *.pyc), Node (node_modules, dist), .env, uploads, pgdata, certs

**Verification:** `docker compose up --build` starts all services. Nginx serves frontend at `https://localhost`, health check passes at `https://localhost/api/v1/health`.

---

## Phase 1: Auth & User Management

### Task #4 — User model, fastapi-users setup & auth routes
**Blocked by:** #1

- Create `app/models/user.py` — User SQLModel with all fields: id, email, hashed_password, display_name, is_active, is_superuser, dietary_restrictions (JSONB), allergies (JSONB), preferred_units, favorite_cuisines (JSONB), disliked_ingredients (JSONB), default_servings, meal_plan_system_prompt, auth_providers (JSONB), created_at, updated_at
- Create `app/core/security.py` — fastapi-users config: UserManager, JWT strategy (access 30min, refresh 7d), transport, auth backend
- Create `app/schemas/user.py` — UserCreate, UserUpdate, UserRead Pydantic models
- Create `app/api/deps.py` — get_db, get_current_user (current_active_user), get_current_superuser
- Create `app/api/routes/users.py` — fastapi-users auth routers at `/api/v1/auth/` (register, login, token refresh, verify)
- Add user profile endpoints: `GET/PATCH /api/v1/users/me`
- Create initial Alembic migration for users table
- Add rate limiting (slowapi) on auth endpoints: 10 attempts/minute

### Task #5 — Google OAuth integration
**Blocked by:** #4

- Configure fastapi-users OAuth router for Google provider
- Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET to config.py
- Register OAuth callback route at `/api/v1/auth/google/callback`
- Store provider info in user.auth_providers JSONB
- Encrypt OAuth tokens using Fernet (cryptography library)

### Task #6 — Frontend auth (login, register, auth store, route guards)
**Blocked by:** #2, #4

- Create `types/user.ts` — User, UserCreate, LoginCredentials interfaces
- Create `api/auth.ts` — login, register, refreshToken, getMe, updateProfile API functions
- Create `stores/useUserStore.ts` — full auth state: user, token, isAuthenticated, isSuperuser, login(), register(), logout(), refreshToken(), fetchProfile()
- Token storage in localStorage (access_token, refresh_token)
- Create `views/LoginView.vue` — email/password form + Google OAuth button
- Create `views/RegisterView.vue` — registration form
- Implement auth guard in `router/index.ts` (redirect to /login with ?redirect= param)
- Implement 401 interceptor in `api/client.ts` with token refresh + retry logic
- Mobile-first responsive design (375px base)

---

## Phase 2: Recipe CRUD & Versioning

### Task #7 — Recipe & RecipeVersion models, schemas, service, and routes
**Blocked by:** #4

- Create `app/models/recipe.py` — Recipe and RecipeVersion SQLModel tables (all fields from data model)
- Create Alembic migration for recipes + recipe_versions tables
- Create `app/schemas/recipe.py` — RecipeCreate, RecipeUpdate, RecipeResponse, RecipeVersionResponse, PaginatedRecipeResponse
- Create `app/services/recipe_service.py`:
  - `create_recipe()` — create Recipe + initial RecipeVersion
  - `get_recipe()` — fetch recipe with current version joined
  - `update_recipe()` — copy-on-write: create new RecipeVersion, update current_version_id
  - `delete_recipe()` — owner only
  - `list_recipes()` — cursor-based pagination with owner filter
  - `get_versions()` — list all versions of a recipe
  - `restore_version()` — set current_version_id to a previous version
- Create `app/api/routes/recipes.py`:
  - `GET /api/v1/recipes` (list, paginated)
  - `POST /api/v1/recipes` (create)
  - `GET /api/v1/recipes/{id}` (detail)
  - `PUT /api/v1/recipes/{id}` (update — triggers new version)
  - `DELETE /api/v1/recipes/{id}`
  - `GET /api/v1/recipes/{id}/versions` (version history)
  - `POST /api/v1/recipes/{id}/versions/{version_id}/restore`
- All routes require auth. Owner-only for private recipes. Shared recipes readable by all authenticated users.

### Task #8 — Frontend recipe views and components
**Blocked by:** #6, #7

- Create `types/recipe.ts` — Recipe, RecipeVersion, RecipeCreate, RecipeUpdate, Ingredient, Step, PaginatedResponse interfaces
- Create `api/recipes.ts` — all recipe API functions (CRUD, versions, restore)
- Create `stores/useRecipeStore.ts` — recipes state, cursor pagination (nextCursor, hasMore, loadMore), CRUD actions
- Components:
  - `RecipeCard.vue` — card with title, tags, time, thumbnail
  - `IngredientRow.vue` — single ingredient display/edit (name, qty, unit)
  - `StepRow.vue` — single step display/edit (order, instruction)
  - `TagFilter.vue` — tag selection using pre-built tag categories
  - `RecipeForm.vue` — reusable form for create/edit
- Views:
  - `RecipeListView.vue` — grid of RecipeCards with infinite scroll/load more
  - `RecipeDetailView.vue` — full recipe display with version history panel
  - `RecipeCreateView.vue` — RecipeForm for new recipe
  - `RecipeEditView.vue` — RecipeForm pre-populated for editing
- Responsive grid: 1 col phone, 2 col tablet, 3 col desktop
- Register routes in router/index.ts

---

## Phase 3: AI-Powered Recipe Import

### Task #9 — AI service setup and recipe import backend
**Blocked by:** #7

- Create `app/services/ai_service.py` — OpenRouter client via instructor library (AsyncOpenAI + instructor.from_openai, JSON mode)
- Create `app/schemas/ai_responses.py` — RecipeImportResponse Pydantic model (title, description, ingredients[], steps[], servings, prep_time, cook_time, waiting_time, tags, source)
- Create `app/services/recipe_import.py`:
  - `process_url_import()` — fetch URL via httpx, extract content, AI call to parse, validate, create draft or mark needs_review
  - `process_image_import()` — read image, base64-encode, AI call to extract, validate, create draft or mark needs_review
- Retry logic: 3 attempts with exponential backoff, 60s timeout
- `require_parameters=True` in OpenRouter provider config
- Log AI calls (model, tokens, latency, success/failure)
- Create `app/tasks/import_tasks.py` — background task wrappers
- Import routes in `app/api/routes/recipes.py`:
  - `POST /api/v1/recipes/import/url` (returns 202 + task_id)
  - `POST /api/v1/recipes/import/image` (returns 202 + task_id)
  - `GET /api/v1/recipes/import/{task_id}/status` (poll for completion)
- Rate limiting on AI endpoints: 20 requests/hour per user
- Daily cleanup task for expired uploads (>24h)

### Task #10 — Frontend recipe import UI
**Blocked by:** #8, #9

- Components:
  - `RecipeImportUrlForm.vue` — URL input + submit
  - `RecipeImportImageForm.vue` — file upload (camera capture on mobile) + submit
  - `RecipeImportReview.vue` — AI-extracted recipe review/edit before confirming
  - `ImportStatusIndicator.vue` — loading/progress while background task runs
- Create `views/RecipeImportView.vue` — tabbed view for URL vs image import
- Polling logic for import task status until complete
- On completion: navigate to review screen, user edits and confirms
- Handle needs_review state: show partial data with highlighted missing fields
- "Import Recipe" action button in recipe list view
- Mobile: camera capture for image import

---

## Phase 4: Recipe Search & Filtering

### Task #11 — Full-text search and tag filtering
**Blocked by:** #7, #8

**Backend:**
- Add PostgreSQL full-text search on RecipeVersion (title, description, ingredient names)
- Create GIN index on tsvector column
- Add search + filter query params to `GET /api/v1/recipes?q=chicken&tags=italian,dinner`
- Support filtering by: tags (AND/OR), meal_type, cuisine, protein, diet
- Support sorting by: created_at, title, total_time_minutes
- Combine search + filters + cursor pagination

**Frontend:**
- `SearchBar.vue` — search input with debounced query
- Enhanced `TagFilter.vue` — grouped by category (protein, diet, season, meal type, cuisine)
- Update `RecipeListView.vue` — integrate search bar + tag filters
- Update `useRecipeStore.ts` — search/filter state, debounced API calls
- Mobile: collapsible filter panel

---

## Phase 5: Meal Planning

### Task #12 — Meal plan models, service, and routes
**Blocked by:** #7, #9

- Create `app/models/meal_plan.py` — MealPlan and MealPlanEntry SQLModel tables
- Create Alembic migration for meal_plans + meal_plan_entries
- Create `app/schemas/meal_plan.py` — MealPlanCreate, MealPlanUpdate, MealPlanResponse, MealPlanEntryCreate, MealPlanEntryResponse
- Create `app/services/meal_planner.py`:
  - `create_meal_plan()` — create plan with date range, status=draft
  - `add_entry()` / `remove_entry()` / `update_entry()` — manage slots
  - `reorder_entries()` — update position for multiple dishes in same slot
  - `update_status()` — draft → active → completed
  - `generate_suggestions()` — build AI prompt from user prefs + carryovers + constraints, call AI, return structured suggestions
- Routes in `app/api/routes/meal_plans.py`:
  - `GET /api/v1/meal-plans` (list, paginated)
  - `POST /api/v1/meal-plans` (create)
  - `GET /api/v1/meal-plans/{id}` (detail with entries)
  - `PUT /api/v1/meal-plans/{id}` (update)
  - `DELETE /api/v1/meal-plans/{id}`
  - `POST /api/v1/meal-plans/{id}/entries` (add entry)
  - `DELETE /api/v1/meal-plans/{id}/entries/{entry_id}`
  - `POST /api/v1/meal-plans/generate` (AI generation, returns 202)

### Task #13 — Frontend meal plan views with drag-and-drop
**Blocked by:** #8, #12

- Create `types/mealPlan.ts` — MealPlan, MealPlanEntry, MealType interfaces
- Create `api/mealPlans.ts` — all meal plan API functions
- Create `stores/useMealPlanStore.ts` — plan state, entries, CRUD + generation actions
- Components:
  - `MealSlot.vue` — single slot (date + meal_type) showing assigned recipe(s), drop target
  - `MealPlanDay.vue` — day column with breakfast/lunch/dinner/snack slots
  - `MealPlanWeek.vue` — week grid of MealPlanDay columns
  - `MealPlanSuggestion.vue` — AI suggestion card with accept/reject + reasoning
  - `RecipePicker.vue` — modal/drawer to search and select recipes
- Views:
  - `MealPlanListView.vue` — list with status badges
  - `MealPlanDetailView.vue` — week grid with drag-and-drop (vuedraggable), AI generate button
  - `MealPlanCreateView.vue` — form for name + date range
- Drag-and-drop between meal slots using vuedraggable
- AI flow: set constraints → generate → review → accept/reject per slot → re-generate unfilled
- Mobile: vertical day layout instead of horizontal week grid

---

## Phase 6: Meal Plan Logging & Carryover

### Task #14 — Meal plan logging, carryover meals, and cook log
**Blocked by:** #12, #13

**Backend:**
- Create `app/models/cook_log.py` — CarryoverMeal and RecipeCookLog SQLModel tables
- Create Alembic migration for carryover_meals + recipe_cook_logs
- Create `app/schemas/cook_log.py` — CookLogCreate, CookLogResponse, CarryoverMealResponse
- Add to `app/services/meal_planner.py`:
  - `log_meal_plan()` — compare actual vs planned, create RecipeCookLog for cooked, CarryoverMeal for uncooked/leftover
  - `get_unresolved_carryovers()` — fetch unresolved carryovers (injected into next AI generation)
  - `resolve_carryover()` — mark resolved when assigned to new plan
- Routes:
  - `POST /api/v1/meal-plans/{id}/log`
  - `GET /api/v1/meal-plans/carryovers`

**Frontend:**
- `MealPlanLogView.vue` — checklist: for each planned meal, mark as cooked (optional rating 1-5 + notes) or not cooked (reason: not_cooked/leftover)
- Show unresolved carryovers in meal plan creation/generation flow
- Add cook history to RecipeDetailView (times cooked, last cooked, avg rating)

---

## Phase 7: Shopping Lists

### Task #15 — Shopping list generation and management
**Blocked by:** #12

**Backend:**
- Create `app/models/shopping_list.py` — ShoppingList and ShoppingListItem SQLModel tables
- Create Alembic migration for shopping_lists + shopping_list_items
- Create `app/schemas/shopping_list.py` — ShoppingListResponse, ShoppingListItemResponse, ShoppingListItemUpdate
- Create `app/services/shopping.py`:
  - `generate_shopping_list()` — aggregate ingredients from MealPlanEntries, merge same name+unit (sum quantities), track source recipe_ids
  - `update_item_checked()` — toggle checked status
  - Regenerate when meal plan entries change
- Routes:
  - `GET /api/v1/shopping-lists/{meal_plan_id}` (get or auto-generate)
  - `PATCH /api/v1/shopping-lists/{id}/items/{item_id}` (toggle checked)

**Frontend:**
- Create `types/shoppingList.ts`, `api/shoppingLists.ts`, `stores/useShoppingListStore.ts`
- `ShoppingListView.vue` — checklist grouped alphabetically, check-off, quantity display, source recipe references
- Link from MealPlanDetailView → ShoppingListView
- Mobile-optimized for shopping use (large tap targets, swipe to check)

---

## Phase 8: Admin Dashboard

### Task #17 — Admin dashboard (user management)
**Blocked by:** #4, #6

**Backend:**
- Create `app/api/routes/admin.py`:
  - `GET /api/v1/admin/users` (list all, paginated)
  - `GET /api/v1/admin/users/{id}` (detail with stats)
  - `PATCH /api/v1/admin/users/{id}` (toggle is_active, is_superuser)
  - `DELETE /api/v1/admin/users/{id}` (deactivate)
- All routes protected with `Depends(current_superuser)`

**Frontend:**
- `views/AdminView.vue` — user management table with search, sort, pagination
- Show: email, display_name, is_active, is_superuser, recipe count, last login
- Actions: toggle active, toggle superuser, view details
- Responsive table (card layout on mobile)
- Route `/admin` with requiresSuperuser guard

---

## Phase 10: Testing & Production Polish

### Task #18 — Backend test suite
**Blocked by:** #14

- Create `tests/conftest.py` — async test client, test DB setup, fixture loading
- Create `tests/fixtures/` seed data: users.json, recipes.json, meal_plans.json
- Unit tests:
  - `test_recipe_import_service.py` — URL parsing, AI response validation (mock AI)
  - `test_meal_planner_service.py` — prompt building, suggestion parsing (mock AI)
  - `test_shopping_service.py` — ingredient aggregation, merging
- Integration tests:
  - `test_auth_routes.py` — register, login, token refresh, protected access
  - `test_recipe_routes.py` — full CRUD, versioning, pagination
  - `test_meal_plan_routes.py` — plan creation, entries, status transitions
  - `test_import_routes.py` — import endpoints with mocked AI
- Target 80%+ coverage. All AI calls mocked.

### Task #19 — Frontend tests and E2E suite
**Blocked by:** #15

**Unit tests (Vitest):**
- Pinia stores: useRecipeStore, useMealPlanStore, useUserStore, useShoppingListStore
- Composables: pagination, auth state
- Key component behavior with @vue/test-utils

**E2E tests (Playwright):**
- Login/register flow
- Create recipe manually
- Import recipe from URL
- Search + tag filtering
- Create and manage meal plan
- AI meal plan generation
- Log meal plan execution
- Shopping list check-off
- Admin user management

### Task #20 — Security hardening and production polish
**Blocked by:** #18, #19

- Verify rate limiting: auth (10/min), AI (20/hr/user)
- HTML sanitization on recipe text fields
- CORS restricted to configured origins
- Pydantic validation on all inputs
- No internal fields leak in responses
- Fernet encryption for OAuth tokens
- Docker Compose production build verified end-to-end
- Nginx TLS termination, HTTP→HTTPS redirect
- Health check works with Docker healthcheck
- DB connection pooling settings verified
- `.env.example` with documented vars

---

## Dependency Graph

```
Phase 0 (parallel):  #1 Backend ──┐    #2 Frontend ──┐    #3 Docker
                                   │                  │
Phase 1:                           └─► #4 Auth ──────┐├──► #6 Frontend Auth
                                       │    └──► #5 OAuth  │
                                       │                    │
Phase 2:                               └──► #7 Recipe BE ──┼──► #8 Recipe FE
                                            │    │          │
Phase 3:                                    └──► #9 AI Import──► #10 Import FE
                                            │    │          │
Phase 4:                                    ├────┼──────────┴──► #11 Search
                                            │    │
Phase 8:                            #4 ─────┼────┼── #6 ──────► #17 Admin
                                            │    │
Phase 5:                            #7 ──── #9 ──┴──► #12 Plan BE ──► #13 Plan FE
                                                      │                │
Phase 6:                                              └────────────────┴──► #14 Logging
                                                      │
Phase 7:                                              └──► #15 Shopping
                                                                │
Phase 10:                           #14 ──► #18 Tests BE        │
                                            │       #15 ──► #19 Tests FE
                                            └───────────────┴──► #20 Polish
```

## Parallelization Opportunities

1. **Phase 0:** Tasks #1, #2, #3 are fully independent — work all three simultaneously
2. **After #4 (auth):** Tasks #5 (OAuth), #7 (recipes), and #17 (admin backend) can start in parallel
3. **After #7 (recipe backend):** Tasks #9 (AI import) and #11 (search backend) can start in parallel
4. **Independent branches:** #17 (admin) and #11 (search) don't block each other
5. **After #12 (meal plan backend):** Tasks #13 (meal plan FE) and #15 (shopping) can start in parallel
