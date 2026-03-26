# Phase 0: Project Scaffolding Design

**Date:** 2026-03-08
**Status:** Approved
**Scope:** Backend scaffolding, frontend scaffolding, Docker Compose & Nginx setup

## Tooling Decisions

| Area | Choice | Rationale |
|------|--------|-----------|
| Backend package manager | uv | Fast, lockfile support, modern Python standard |
| Frontend package manager | pnpm | Fast, disk-efficient, strict dependency resolution |
| Frontend UI library | PrimeVue (unstyled mode) | Large component set, tree-shakeable, full styling control |
| Local dev database | Postgres via Docker | Reproducible, no local install needed |
| Dev workflow | Backend + frontend native on host, Postgres in Docker | Fast hot-reload, easy debugging |
| FastAPI app structure | Module-level `app = FastAPI(...)` | Simpler, conventional for this project size |
| Build order | Sequential: backend → frontend → Docker | Verified checkpoints at each step, easier to debug |

## Task #1: Backend Scaffolding

### Project setup

- `uv init` in `backend/`, Python 3.12+ target
- `pyproject.toml` with grouped dependencies:
  - **Core:** fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, sqlmodel, alembic, pydantic-settings, httpx, python-multipart
  - **Auth:** fastapi-users[sqlalchemy], bcrypt, cryptography
  - **AI / OpenRouter:** openrouter (native Python SDK, `uv add openrouter`; structured outputs via `response_format` JSON schema + Pydantic `model_validate_json()`)
  - **Rate limiting:** slowapi
  - **Dev:** ruff, mypy, pytest, pytest-cov, pytest-asyncio
- `uv.lock` committed for reproducible installs

### Directory structure

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

### Key details

- Module-level `app = FastAPI(...)`, not a factory function.
- Use FastAPI `lifespan` context manager (not deprecated `on_event`) for startup/shutdown — skeleton only in Phase 0.
- `GET /health` returns `{"status": "ok", "db": "connected"}` via `SELECT 1`. Returns 503 with `{"status": "error", "db": "disconnected"}` if DB unreachable.
- Pydantic Settings reads env vars with `.env` file support. All required vars: DATABASE_URL, SECRET_KEY, OPENROUTER_API_KEY, UPLOAD_DIR, CORS_ORIGINS. All optional vars with defaults as specified in CLAUDE.md.
- Alembic `env.py` configured for async SQLAlchemy with SQLModel metadata.
- Dockerfile for production container build.

## Task #2: Frontend Scaffolding

### Project setup

- `pnpm create vue@latest` with TypeScript, Vue Router, Pinia presets
- Add dependencies: axios, vuedraggable, primevue (unstyled mode)
- Add dev dependencies: vitest, @vue/test-utils, @playwright/test, eslint, prettier
- `pnpm-lock.yaml` committed

### Directory structure

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

### Key details

- PrimeVue unstyled mode enabled globally. No preset theme — all styling via scoped CSS in components.
- PrimeVue components imported individually (tree-shakeable), not globally registered.
- Vite proxy: `/api` requests forwarded to `http://localhost:8000` so frontend calls backend without CORS issues in dev.
- HomeView calls `GET /api/v1/health` on mount and displays the connection status — proves frontend-to-backend proxy works.
- Dockerfile for production container build.

## Task #3: Docker Compose & Nginx

### Compose files

**`docker-compose.dev.yml`** — local development, Postgres only:
- postgres:16 on port 5432, user/pass/db = secretsauce
- Volume for data persistence, healthcheck with `pg_isready`
- Backend and frontend run natively on host (not containerized in dev)

**`docker-compose.yml`** — production with all four services:
- backend, frontend, postgres, nginx
- Backend and frontend each built from their respective Dockerfiles
- Postgres with persistent volume + healthcheck
- Nginx on ports 80 and 443

**`docker-compose.test.yml`** — test environment:
- Same as production but with separate `secretsauce_test` database
- No Nginx, ports exposed directly for test runners

### Nginx

`nginx/nginx.conf`:
- `/api/` → proxy to `backend:8000`
- `/` → serve frontend static build or proxy to frontend container
- TLS termination (placeholder config, certs mounted from `./certs/`)
- HTTP → HTTPS redirect

### Root files

- `.env.example` — documented template with all required + optional env vars
- `.gitignore` — Python (__pycache__, .venv, *.pyc), Node (node_modules, dist), .env, uploads, pgdata, certs

### Verification

`docker compose up --build` starts all services. Nginx serves frontend at `https://localhost`. Health check passes at `https://localhost/api/v1/health`.

## Build Order

Sequential with verified checkpoints:

1. **Backend scaffolding** — verify `uvicorn app.main:app --reload` starts, `GET /health` returns 200 (with Postgres from docker-compose.dev.yml)
2. **Frontend scaffolding** — verify `pnpm dev` starts, HomeView loads, health check call succeeds through Vite proxy
3. **Docker & Nginx** — verify `docker compose up --build` starts full stack, Nginx routes work end-to-end
