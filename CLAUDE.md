# Mealtime Flow — CLAUDE.md

## Project Overview

Mealtime Flow is a recipe management and meal planning web application. Users can import recipes, maintain a recipe collection, and get AI-assisted meal plans. Target users are friends and family — enthusiastic home cooks and busy families planning weekly meals, frequently using phones alongside cookbooks.

## Tech Stack

- **Backend:** Python 3.12+, FastAPI, Uvicorn
- **Frontend:** Vue 3 (Composition API) with Vite, Pinia for state management, Vue Router
- **Database:** PostgreSQL 16 with SQLAlchemy (async, via asyncpg) and SQLModel
- **Migrations:** Alembic
- **Auth:** fastapi-users (JWT + OAuth via Google/Apple/Facebook)
- **AI Integration:** OpenRouter API with structured outputs (Pydantic response models via instructor library)
- **Testing:** pytest (backend), Vitest (frontend unit), Playwright (end-to-end)
- **Deployment:** Docker Compose
- **Reverse Proxy:** Nginx

## Project Structure

```
mealtime-flow/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/           # One file per domain: recipes.py, meal_plans.py, users.py, shopping_lists.py, admin.py
│   │   │   └── deps.py           # Shared dependencies: get_db, get_current_user, get_current_superuser
│   │   ├── models/               # SQLAlchemy/SQLModel table definitions, one file per domain
│   │   ├── schemas/              # Pydantic request/response models, one file per domain
│   │   ├── services/             # Business logic: ai_service.py, recipe_import.py, meal_planner.py, shopping.py
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings for env vars
│   │   │   ├── security.py       # Auth configuration (fastapi-users setup)
│   │   │   ├── database.py       # Engine, session factory, Base
│   │   │   └── constants.py      # Enums, tag lists, unit definitions
│   │   ├── tasks/                # Background task functions (recipe import, AI calls)
│   │   └── main.py               # FastAPI app factory, router includes, startup/shutdown events
│   ├── alembic/
│   │   ├── versions/
│   │   └── env.py
│   ├── alembic.ini
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── fixtures/             # Fixed test data (JSON seed files)
│   │   └── conftest.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── CLAUDE.md                 # Backend-specific conventions
├── frontend/
│   ├── src/
│   │   ├── views/                # Page-level components
│   │   ├── components/           # Reusable UI components
│   │   ├── composables/          # Shared Vue composition functions
│   │   ├── stores/               # Pinia state stores
│   │   ├── api/                  # API client functions
│   │   ├── router/               # Vue Router config with auth guards
│   │   ├── types/                # TypeScript interfaces matching backend schemas
│   │   └── assets/               # Static assets, global styles
│   ├── e2e/                      # Playwright end-to-end tests
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── CLAUDE.md                 # Frontend-specific conventions
├── nginx/
│   └── nginx.conf                # Reverse proxy: /api/* → backend, /* → frontend
├── docker-compose.yml            # Production: backend, frontend, postgres, nginx
├── docker-compose.test.yml       # Test environment with test database
├── CLAUDE.md                     # This file — project-wide overview
└── README.md
```

### Structural Rules

- **Routes are thin.** Route handlers validate input, call a service function, and return the response. No business logic in route files.
- **Services contain business logic.** All AI calls, recipe import logic, meal plan generation, and shopping list aggregation live in `services/`.
- **Models are database tables.** One SQLModel class per table. No business methods on models.
- **Schemas are API contracts.** Separate Pydantic models for create, update, and response. Never expose internal model fields (like hashed passwords) in response schemas.
- **One file per domain in each layer.** Don't create `routes/recipe_create.py` and `routes/recipe_read.py`. Keep all recipe routes in `routes/recipes.py`.

## API Contract

Both backend and frontend must follow these conventions. See `backend/CLAUDE.md` for implementation details and `frontend/CLAUDE.md` for how the frontend consumes these endpoints.

### Conventions

- RESTful API under `/api/v1/` prefix.
- Plural nouns for resources: `/api/v1/recipes`, `/api/v1/meal-plans`, `/api/v1/shopping-lists`.
- Standard HTTP methods: GET (list/detail), POST (create), PUT (full update), PATCH (partial update), DELETE.
- Cursor-based pagination for list endpoints. Response format:
  ```json
  {
    "items": [...],
    "next_cursor": "abc123",
    "has_more": true
  }
  ```
- Consistent error response format:
  ```json
  {
    "detail": "Human-readable error message",
    "error_code": "RECIPE_NOT_FOUND",
    "field_errors": [{"field": "title", "message": "Required"}]
  }
  ```
- All timestamps in UTC, ISO 8601 format.

### Key Endpoints

- `POST /api/v1/recipes/import/url` — import recipe from URL (returns 202, processes via BackgroundTasks)
- `POST /api/v1/recipes/import/image` — import recipe from uploaded image (returns 202, processes via BackgroundTasks)
- `GET /api/v1/recipes/{id}/versions` — list recipe version history
- `POST /api/v1/recipes/{id}/versions/{version_id}/restore` — restore a previous version
- `POST /api/v1/meal-plans/generate` — AI-generated meal plan suggestions (returns 202, processes via BackgroundTasks)
- `POST /api/v1/meal-plans/{id}/log` — log actually cooked meals, creating carryover entries
- `GET /api/v1/shopping-lists/{meal_plan_id}` — auto-generated shopping list from a meal plan

## Data Model

### User
`id`, `email`, `hashed_password`, `display_name`, `is_active`, `is_superuser`, `dietary_restrictions` (JSONB), `allergies` (JSONB), `preferred_units` (metric|imperial), `favorite_cuisines` (JSONB), `disliked_ingredients` (JSONB), `default_servings` (int), `meal_plan_system_prompt` (text, user's custom AI instructions), `auth_providers` (JSONB), `created_at`, `updated_at`

Managed by fastapi-users. The `dietary_restrictions`, `allergies`, `favorite_cuisines`, and `disliked_ingredients` fields are injected into the AI system prompt for meal plan generation.

### Recipe
`id`, `owner_id` (FK → User), `current_version_id` (FK → RecipeVersion), `visibility` (private|shared), `created_at`, `updated_at`

Always points to the current version. All content lives in RecipeVersion.

### RecipeVersion
`id`, `recipe_id` (FK → Recipe), `version_number` (int, auto-increment per recipe), `title`, `description`, `ingredients` (JSONB array: `[{name, quantity, unit}]`), `steps` (JSONB array: `[{order, instruction}]`), `servings` (int), `prep_time_minutes`, `waiting_time_minutes`, `cook_time_minutes`, `total_time_minutes` (computed), `tags` (JSONB array), `recipe_source` (JSONB: `{type: "url"|"book", url?: string, book_title?: string, page?: int}`), `created_at`, `created_by` (FK → User)

Copy-on-write versioning: every edit creates a new RecipeVersion row and updates Recipe.current_version_id. Never mutate existing versions.

### Pre-built Tags
Tags are stored as string arrays in JSONB. Use these pre-built categories:
- **Protein:** vegan, vegetarian, fish, poultry, meat, seafood
- **Diet:** low-calorie, high-calorie, low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean
- **Season:** spring, summer, autumn, winter
- **Meal type:** breakfast, lunch, dinner, snack, dessert
- **Cuisine:** italian, mexican, japanese, chinese, indian, thai, french, greek, middle-eastern, american, korean

### MealPlan
`id`, `user_id` (FK → User), `name`, `start_date`, `end_date`, `status` (draft|active|completed), `ai_prompt_used` (text, snapshot of prompt used to generate), `created_at`, `updated_at`

### MealPlanEntry
`id`, `meal_plan_id` (FK → MealPlan), `date`, `meal_type` (breakfast|lunch|dinner|snack), `recipe_id` (FK → Recipe), `servings` (int), `source` (ai_suggested|manual|carryover), `position` (int, for ordering multiple dishes in same slot), `created_at`

### CarryoverMeal
`id`, `user_id` (FK → User), `source_meal_plan_id` (FK → MealPlan), `recipe_id` (FK → Recipe), `original_date`, `original_meal_type`, `reason` (not_cooked|leftover), `target_meal_plan_id` (FK → MealPlan, nullable — null until assigned), `resolved` (bool, default false), `created_at`

Created when a user logs their actual meal plan. Unresolved carryovers are surfaced when generating the next meal plan.

### RecipeCookLog
`id`, `user_id` (FK → User), `recipe_id` (FK → Recipe), `meal_plan_id` (FK → MealPlan, nullable), `cooked_at` (date), `rating` (int 1-5, nullable), `notes` (text, nullable), `created_at`

Created when user confirms a meal was actually cooked. Used for recipe frequency tracking and future recommendation features.

### ShoppingList
`id`, `user_id` (FK → User), `meal_plan_id` (FK → MealPlan), `name`, `created_at`, `updated_at`

### ShoppingListItem
`id`, `shopping_list_id` (FK → ShoppingList), `ingredient_name`, `quantity` (float), `unit`, `recipe_ids` (JSONB array — which recipes need this ingredient), `checked` (bool, default false), `created_at`

Shopping lists are auto-generated from meal plan entries by aggregating ingredients across all recipes. Items with the same ingredient name and unit are merged, summing quantities. Users can manually check off items.

## Configuration

All configuration via environment variables, loaded through Pydantic Settings in `app/core/config.py`.

Required env vars:
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/mealtime
SECRET_KEY=<random-32-byte-hex>
OPENROUTER_API_KEY=<key>
UPLOAD_DIR=/tmp/mealtime-uploads
CORS_ORIGINS=["http://localhost:5173"]
```

Optional env vars with defaults:
```
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AI_MODEL=openai/gpt-4o
AI_TIMEOUT_SECONDS=60
AI_MAX_RETRIES=3
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```

## Deployment

### Docker Compose (Production)

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      retries: 3

  frontend:
    build: ./frontend
    restart: unless-stopped

  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-LINE", "pg_isready -U mealtime"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  pgdata:
```

### Health Check
Backend exposes `GET /health` endpoint (no auth required) returning `{"status": "ok", "db": "connected"}`.

### Database Backups
Daily pg_dump via cron to a backup volume. Retain 7 daily backups.

### TLS
Nginx terminates TLS. Use Let's Encrypt / certbot for certificates. Redirect all HTTP to HTTPS.

## Non-Functional Requirements

- **Mobile-first responsive design.** All features must work on screens ≥ 375px wide.
- **TLS 1.2+ / HTTPS everywhere** via Nginx termination.
- **Sensitive data encryption:** User tokens and PII encrypted at application level using `cryptography` library (Fernet symmetric encryption) for fields like OAuth tokens. Database at rest encryption deferred to PostgreSQL/hosting provider.
- **CORS:** Restricted to configured origins only.
- **Rate limiting:** Apply to auth endpoints (10 attempts/minute) and AI endpoints (20 requests/hour per user). Use slowapi library.
- **Input validation:** Pydantic on all API inputs. Sanitize HTML in recipe text fields.

## MVP Scope

The MVP includes:
- User registration/login (email + password, Google OAuth)
- Recipe CRUD with versioning
- Recipe import from URL (AI-powered)
- Recipe import from image/photo (AI-powered)
- Full-text search and filtering on recipes
- Meal plan creation (manual + AI-assisted)
- Meal plan execution logging (actual vs. planned, carryover creation)
- Shopping list generation from meal plans
- Export recipes as PDF
- Admin dashboard (user management)

Deferred from MVP:
- Apple/Facebook OAuth (add after MVP)
- Self-learning popularity/recommendation engine (track RecipeCookLog data from day one, build recommendations later)
- Unit conversion (gram ↔ cups ↔ ounces)
- Signal messenger sharing
- Smart lists ("your top 15", "explore something new")

## Running Tests

```bash
# Backend unit + integration tests
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend unit tests
cd frontend && npm run test:unit

# E2E tests (requires running test stack)
docker compose -f docker-compose.test.yml up -d
cd frontend && npx playwright test
```

Always run the relevant test suite after making code changes. Tests must pass before committing.
