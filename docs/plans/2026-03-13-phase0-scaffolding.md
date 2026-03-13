# Phase 0: Project Scaffolding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold a working full-stack skeleton — FastAPI backend with a live `/health` endpoint, Vue 3 frontend that calls it through a Vite proxy, and Docker Compose files for dev (Postgres only), production (all services), and test environments.

**Architecture:** Sequential build — backend first (verified standalone), then frontend (verified through proxy), then Docker wiring (verified end-to-end). Each step has an explicit working checkpoint before the next starts.

**Tech Stack:** Python 3.12 + FastAPI + uv, Vue 3 + TypeScript + pnpm + PrimeVue (unstyled), PostgreSQL 16, Docker Compose, Nginx

---

## Task 1: Initialize backend with uv

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`

**Step 1: Run uv init**

```bash
cd backend
uv init --python 3.12
```

Expected: Creates `pyproject.toml`, `.python-version`, `hello.py` (delete it).

**Step 2: Delete the generated hello.py**

```bash
rm backend/hello.py
```

**Step 3: Add all dependencies**

```bash
cd backend

# Core
uv add fastapi uvicorn[standard] "sqlalchemy[asyncio]" asyncpg sqlmodel alembic pydantic-settings httpx python-multipart

# Auth
uv add "fastapi-users[sqlalchemy]" bcrypt cryptography

# AI / OpenRouter
uv add openrouter

# Rate limiting
uv add slowapi

# Dev dependencies
uv add --dev ruff mypy pytest pytest-cov pytest-asyncio httpx
```

Expected: `uv.lock` created, `.venv/` created.

**Step 4: Verify install**

```bash
cd backend
uv run python -c "import fastapi, sqlmodel, openrouter; print('OK')"
```

Expected: `OK`

**Step 5: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/.python-version
git commit -m "chore: initialize backend with uv and all dependencies"
```

---

## Task 2: Create backend app skeleton

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/core/constants.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/routes/__init__.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/tasks/__init__.py`

**Step 1: Create all `__init__.py` files**

```bash
mkdir -p backend/app/{api/routes,core,models,schemas,services,tasks}
touch backend/app/__init__.py
touch backend/app/core/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/routes/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/services/__init__.py
touch backend/app/tasks/__init__.py
```

**Step 2: Write `app/core/config.py`**

```python
# backend/app/core/config.py
import json
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Required
    DATABASE_URL: str
    SECRET_KEY: str
    OPENROUTER_API_KEY: str
    UPLOAD_DIR: str = "/tmp/mealtime-uploads"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Optional with defaults
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AI_MODEL: str = "openai/gpt-4o"
    AI_TIMEOUT_SECONDS: int = 60
    AI_MAX_RETRIES: int = 3
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20


settings = Settings()
```

**Step 3: Write `app/core/database.py`**

```python
# backend/app/core/database.py
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    echo=False,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

**Step 4: Write `app/core/constants.py`**

```python
# backend/app/core/constants.py
from enum import StrEnum


class RecipeVisibility(StrEnum):
    PRIVATE = "private"
    SHARED = "shared"


class MealType(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class MealPlanStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class MealEntrySource(StrEnum):
    AI_SUGGESTED = "ai_suggested"
    MANUAL = "manual"
    CARRYOVER = "carryover"


class CarryoverReason(StrEnum):
    NOT_COOKED = "not_cooked"
    LEFTOVER = "leftover"


class PreferredUnits(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


# Pre-built tag lists (stored as strings in JSONB arrays)
PROTEIN_TAGS = ["vegan", "vegetarian", "fish", "poultry", "meat", "seafood"]
DIET_TAGS = [
    "low-calorie", "high-calorie", "low-carb", "high-protein",
    "gluten-free", "dairy-free", "keto", "paleo", "mediterranean",
]
SEASON_TAGS = ["spring", "summer", "autumn", "winter"]
MEAL_TYPE_TAGS = ["breakfast", "lunch", "dinner", "snack", "dessert"]
CUISINE_TAGS = [
    "italian", "mexican", "japanese", "chinese", "indian",
    "thai", "french", "greek", "middle-eastern", "american", "korean",
]
ALL_TAGS = PROTEIN_TAGS + DIET_TAGS + SEASON_TAGS + MEAL_TYPE_TAGS + CUISINE_TAGS
```

**Step 5: Write `app/api/deps.py`**

```python
# backend/app/api/deps.py
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
```

**Step 6: Verify files import cleanly**

```bash
cd backend
uv run python -c "from app.core.config import settings; from app.core.database import engine; from app.core.constants import MealType; print('OK')"
```

Expected: `OK` (will fail if DATABASE_URL missing — create a `.env` first):

```bash
# backend/.env (for local dev)
echo 'DATABASE_URL=postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime
SECRET_KEY=dev-secret-key-change-in-production
OPENROUTER_API_KEY=sk-or-placeholder
UPLOAD_DIR=/tmp/mealtime-uploads
CORS_ORIGINS=["http://localhost:5173"]' > backend/.env
```

**Step 7: Commit**

```bash
git add backend/app/ backend/.env.example
git commit -m "chore: add backend app skeleton (config, database, constants, deps)"
```

> Note: `.env` is gitignored. Copy `.env.example` to `.env` for local dev.

---

## Task 3: Create health route and FastAPI main app

**Files:**
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/main.py`

**Step 1: Write the health route**

```python
# backend/app/api/routes/health.py
from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.api.deps import get_db

router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail={"status": "error", "db": "disconnected"})
```

**Step 2: Write `app/main.py`**

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import health


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing yet — Alembic handles migrations separately
    yield
    # Shutdown: nothing yet


app = FastAPI(
    title="Mealtime Flow API",
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

app.include_router(health.router, prefix="/api/v1")
```

**Step 3: Start Postgres via Docker dev compose** (create the file first — covered in Task 8 — or do this manually for now):

```bash
# Temporary: start Postgres directly for testing
docker run -d --name mealtime-pg \
  -e POSTGRES_USER=mealtime \
  -e POSTGRES_PASSWORD=mealtime \
  -e POSTGRES_DB=mealtime \
  -p 5432:5432 \
  postgres:16
```

**Step 4: Verify the health endpoint**

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

In a separate terminal:

```bash
curl http://localhost:8000/api/v1/health
```

Expected: `{"status":"ok","db":"connected"}`

**Step 5: Commit**

```bash
git add backend/app/api/routes/health.py backend/app/main.py
git commit -m "feat: add FastAPI app with /health endpoint and DB connectivity check"
```

---

## Task 4: Write backend health endpoint test

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

**Step 1: Write conftest.py**

```python
# backend/tests/conftest.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.main import app
from app.api.deps import get_db

TEST_DATABASE_URL = "postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime_test"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
async def db_setup():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest.fixture
async def client(db_setup):
    async def override_get_db():
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
```

**Step 2: Write `pyproject.toml` pytest config** (add to existing `pyproject.toml`):

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

**Step 3: Write the failing test**

```python
# backend/tests/test_health.py
import pytest


@pytest.mark.anyio
async def test_health_returns_ok_when_db_connected(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "connected"
```

**Step 4: Run test to verify it fails (before mealtime_test db exists)**

```bash
cd backend
uv run pytest tests/test_health.py -v
```

Expected: FAIL or connection error (mealtime_test DB doesn't exist yet).

**Step 5: Create test database**

```bash
docker exec mealtime-pg psql -U mealtime -c "CREATE DATABASE mealtime_test;"
```

**Step 6: Run test to verify it passes**

```bash
cd backend
uv run pytest tests/test_health.py -v
```

Expected: `PASSED`

**Step 7: Commit**

```bash
git add backend/tests/ backend/pyproject.toml
git commit -m "test: add health endpoint test with async test client"
```

---

## Task 5: Initialize Alembic

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/` (empty dir)

**Step 1: Initialize Alembic**

```bash
cd backend
uv run alembic init alembic
```

Expected: Creates `alembic.ini` and `alembic/` directory.

**Step 2: Update `alembic/env.py` for async SQLAlchemy + SQLModel**

Replace the generated `alembic/env.py` with:

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from alembic import context
from app.core.config import settings

# Import all models here so Alembic detects them
# from app.models import user, recipe  # uncomment as models are added

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**Step 3: Verify Alembic can connect**

```bash
cd backend
uv run alembic current
```

Expected: `INFO  [alembic.runtime.migration] Context impl PostgreSQLImpl.` followed by current revision (empty).

**Step 4: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "chore: initialize Alembic with async SQLAlchemy + SQLModel metadata"
```

---

## Task 6: Create backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

**Step 1: Write the Dockerfile**

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first (layer cache)
COPY pyproject.toml uv.lock ./

# Install dependencies (no dev deps, no editable install)
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Run as non-root
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: Verify it builds**

```bash
cd backend
docker build -t mealtime-backend .
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "chore: add backend Dockerfile"
```

---

## Task 7: Scaffold frontend with pnpm + PrimeVue

**Files:**
- Create: `frontend/` (entire directory)

**Step 1: Create Vue project**

```bash
cd frontend
pnpm create vue@latest . --typescript --router --pinia --vitest --eslint-with-prettier
```

When prompted: select TypeScript, Vue Router, Pinia, Vitest, ESLint + Prettier. No Cypress or Playwright yet (we add Playwright manually).

**Step 2: Install app dependencies**

```bash
cd frontend
pnpm add axios vuedraggable primevue @primevue/themes
```

**Step 3: Install dev dependencies**

```bash
cd frontend
pnpm add -D @playwright/test @vue/test-utils
```

**Step 4: Update `vite.config.ts`** to add API proxy:

```typescript
// frontend/vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 5: Update `tsconfig.json`** to ensure `@/` alias works:

Verify `compilerOptions.paths` contains `"@/*": ["./src/*"]`. The `pnpm create vue` scaffold should add this automatically.

**Step 6: Commit**

```bash
git add frontend/
git commit -m "chore: initialize frontend with Vue 3, TypeScript, pnpm, PrimeVue"
```

---

## Task 8: Wire up frontend files

**Files:**
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/App.vue`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/stores/useUserStore.ts`
- Create: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/router/index.ts`
- Create: `frontend/src/assets/main.css`

**Step 1: Update `main.ts` to install PrimeVue**

```typescript
// frontend/src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, { unstyled: true })

app.mount('#app')
```

**Step 2: Simplify `App.vue`**

```vue
<!-- frontend/src/App.vue -->
<script setup lang="ts">
</script>

<template>
  <RouterView />
</template>

<style scoped>
</style>
```

**Step 3: Create `api/client.ts`**

```typescript
// frontend/src/api/client.ts
import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Auth token interceptor (skeleton — active after Phase 1)
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 refresh interceptor (skeleton — active after Phase 1)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // TODO Phase 1: attempt token refresh, retry, or redirect to /login
    return Promise.reject(error)
  },
)

export default client
```

**Step 4: Create `stores/useUserStore.ts`**

```typescript
// frontend/src/stores/useUserStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  // Skeleton — full implementation in Phase 1
  const isAuthenticated = ref(false)
  const isSuperuser = ref(false)

  return { isAuthenticated, isSuperuser }
})
```

**Step 5: Create `views/HomeView.vue`**

```vue
<!-- frontend/src/views/HomeView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import client from '@/api/client'

const status = ref<'loading' | 'ok' | 'error'>('loading')
const dbStatus = ref('')

onMounted(async () => {
  try {
    const { data } = await client.get('/health')
    status.value = data.status === 'ok' ? 'ok' : 'error'
    dbStatus.value = data.db
  } catch {
    status.value = 'error'
    dbStatus.value = 'unreachable'
  }
})
</script>

<template>
  <main>
    <h1>Mealtime Flow</h1>
    <p v-if="status === 'loading'">Checking backend connection...</p>
    <p v-else-if="status === 'ok'">Backend: connected (db: {{ dbStatus }})</p>
    <p v-else>Backend: error (db: {{ dbStatus }})</p>
  </main>
</template>

<style scoped>
main {
  padding: 2rem;
  font-family: sans-serif;
}
</style>
```

**Step 6: Update `router/index.ts`** to point at HomeView:

```typescript
// frontend/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      // meta.requiresAuth = true added in Phase 1
    },
  ],
})

// Auth guard skeleton — activated in Phase 1
// router.beforeEach((to) => { ... })

export default router
```

**Step 7: Update `assets/main.css`**

```css
/* frontend/src/assets/main.css */
/* Mobile-first base reset */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  color: #1a1a1a;
  background: #ffffff;
  min-width: 375px;
}

/* Breakpoint variables (use in scoped styles) */
:root {
  --bp-tablet: 768px;
  --bp-desktop: 1024px;
}
```

**Step 8: Delete boilerplate files** from the Vue scaffold (HelloWorld.vue, TheWelcome.vue, icons/, etc.):

```bash
rm -rf frontend/src/components/icons
rm -f frontend/src/components/HelloWorld.vue
rm -f frontend/src/components/TheWelcome.vue
rm -f frontend/src/components/WelcomeItem.vue
rm -f frontend/src/views/AboutView.vue
```

**Step 9: Start backend and frontend, verify the connection**

Terminal 1 (backend must be running from Task 3):
```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

Terminal 2:
```bash
cd frontend && pnpm dev
```

Open `http://localhost:5173`. Expected: "Backend: connected (db: connected)"

**Step 10: Commit**

```bash
git add frontend/src/
git commit -m "feat: wire up frontend skeleton with PrimeVue, API client, HomeView health check"
```

---

## Task 9: Create frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`

**Step 1: Write the Dockerfile**

```dockerfile
# frontend/Dockerfile
FROM node:20-slim AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production: serve static build with Nginx
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx config will be provided by docker-compose volume mount
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Verify it builds**

```bash
cd frontend
docker build -t mealtime-frontend .
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/Dockerfile
git commit -m "chore: add frontend Dockerfile with pnpm build + Nginx static serve"
```

---

## Task 10: Create Docker Compose files and Nginx config

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Create: `nginx/nginx.conf`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create `docker-compose.dev.yml`**

```yaml
# docker-compose.dev.yml — Local development: Postgres only
# Backend and frontend run natively on host.
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: mealtime
      POSTGRES_PASSWORD: mealtime
      POSTGRES_DB: mealtime
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "mealtime"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata_dev:
```

**Step 2: Create `nginx/nginx.conf`**

```nginx
# nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        # TLS — certs mounted from ./certs/ in docker-compose.yml
        ssl_certificate /etc/nginx/certs/cert.pem;
        ssl_certificate_key /etc/nginx/certs/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        # Backend API
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Frontend static files
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**Step 3: Create `docker-compose.yml`** (production):

```yaml
# docker-compose.yml — Production
services:
  backend:
    build: ./backend
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    restart: unless-stopped

  postgres:
    image: postgres:16
    env_file: .env
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-mealtime}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mealtime}
      POSTGRES_DB: ${POSTGRES_DB:-mealtime}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER:-mealtime}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  pgdata:
```

**Step 4: Create `docker-compose.test.yml`**:

```yaml
# docker-compose.test.yml — Test environment
services:
  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://mealtime:mealtime@postgres_test:5432/mealtime_test
      SECRET_KEY: test-secret-key
      OPENROUTER_API_KEY: sk-or-test-placeholder
      UPLOAD_DIR: /tmp/mealtime-uploads
      CORS_ORIGINS: '["http://localhost:5173"]'
    ports:
      - "8000:8000"
    depends_on:
      postgres_test:
        condition: service_healthy

  postgres_test:
    image: postgres:16
    environment:
      POSTGRES_USER: mealtime
      POSTGRES_PASSWORD: mealtime
      POSTGRES_DB: mealtime_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "mealtime"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata_test:
```

**Step 5: Create `.env.example`**

```bash
# .env.example — Copy to .env and fill in values

# Required
DATABASE_URL=postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime
SECRET_KEY=change-me-to-a-random-32-byte-hex-string
OPENROUTER_API_KEY=sk-or-your-key-here
UPLOAD_DIR=/tmp/mealtime-uploads
CORS_ORIGINS=["http://localhost:5173"]

# Postgres (used by docker-compose.yml)
POSTGRES_USER=mealtime
POSTGRES_PASSWORD=mealtime
POSTGRES_DB=mealtime

# Google OAuth (required for Phase 1)
# GOOGLE_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_SECRET=your-client-secret

# Optional — defaults shown
# ACCESS_TOKEN_EXPIRE_MINUTES=30
# REFRESH_TOKEN_EXPIRE_DAYS=7
# AI_MODEL=openai/gpt-4o
# AI_TIMEOUT_SECONDS=60
# AI_MAX_RETRIES=3
# DB_POOL_SIZE=10
# DB_MAX_OVERFLOW=20
```

**Step 6: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.venv/
*.egg-info/
dist/
.mypy_cache/
.ruff_cache/
.pytest_cache/

# Environment
.env
*.env.local

# Node
node_modules/
frontend/dist/
frontend/.vite/

# Database
pgdata/

# Uploads
/tmp/mealtime-uploads/

# TLS certs
certs/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

**Step 7: Stop the temporary Postgres container from Task 3 and start via dev compose**

```bash
docker stop mealtime-pg && docker rm mealtime-pg
docker compose -f docker-compose.dev.yml up -d
```

**Step 8: Verify backend still works with dev compose Postgres**

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/v1/health
```

Expected: `{"status":"ok","db":"connected"}`

**Step 9: Verify full production build**

```bash
# Build frontend first so nginx has dist/ to serve
cd frontend && pnpm build && cd ..

# Start production stack (requires certs — use self-signed for testing)
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=localhost"

docker compose up --build
```

In a new terminal:
```bash
curl -k https://localhost/api/v1/health
```

Expected: `{"status":"ok","db":"connected"}`

**Step 10: Commit everything**

```bash
git add docker-compose.dev.yml docker-compose.yml docker-compose.test.yml nginx/ .env.example .gitignore
git commit -m "chore: add Docker Compose files (dev/prod/test) and Nginx config"
```

---

## Verification Checklist

Before moving to Phase 1, confirm all of the following:

- [ ] `cd backend && uv run uvicorn app.main:app --reload` starts without errors
- [ ] `curl http://localhost:8000/api/v1/health` returns `{"status":"ok","db":"connected"}`
- [ ] `cd backend && uv run pytest tests/test_health.py -v` passes
- [ ] `cd frontend && pnpm dev` starts without errors
- [ ] `http://localhost:5173` shows "Backend: connected (db: connected)"
- [ ] `docker compose -f docker-compose.dev.yml up -d` starts Postgres
- [ ] `docker compose up --build` starts full production stack
- [ ] `curl -k https://localhost/api/v1/health` returns 200 through Nginx
