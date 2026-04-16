# Deployment Guide

This document covers deploying secretsauce.food: test/staging first, then production, then setting up CI/CD.

---

## Prerequisites

All environments require:

- **Podman** 4.4+ and **podman-compose**
  - Windows (local dev): [Podman Desktop](https://podman-desktop.io/) + `uv tool install podman-compose`
  - Linux (production): Ubuntu 24.04 LTS ships Podman 4.9.3 natively — `apt install podman` + `uv tool install podman-compose`
- **Git** — to clone the repo and manage deployments
- A server or VM with at least 1 GB RAM (2 GB recommended for production)
- A domain name with DNS pointing to your server (production only)

---

## Environment Variables

All configuration is via environment variables loaded from a `.env` file in the repo root.

Start from the example:

```bash
cp .env.example .env
```

Then fill in the values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string: `postgresql+asyncpg://user:pass@postgres:5432/dbname` |
| `SECRET_KEY` | Yes | Random 32-byte hex string. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (used for recipe import and meal plan AI) |
| `UPLOAD_DIR` | Yes | Directory for temporary file uploads inside the container: `/tmp/secretsauce-uploads` |
| `CORS_ORIGINS` | Yes | JSON array of allowed origins: `["https://yourdomain.com"]` |
| `POSTGRES_USER` | Yes | Postgres username (used by the postgres service) |
| `POSTGRES_PASSWORD` | Yes | Postgres password |
| `POSTGRES_DB` | Yes | Postgres database name |

Optional variables (defaults shown):

```
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AI_MODEL=gemini-2.5-pro-preview
AI_TIMEOUT_SECONDS=60
AI_MAX_RETRIES=3
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```

---

## Test / Staging Deploy

The test stack (`docker-compose.test.yml`) runs the backend and a dedicated test database. It is designed for running Playwright end-to-end tests but also serves as a staging environment — the full application stack without TLS or a custom domain.

### 1. Clone the repo

```bash
git clone https://github.com/your-org/secretsauce.git
cd secretsauce
```

### 2. Start the test stack

No `.env` file is needed — the test compose file hardcodes safe test credentials:

```bash
docker compose -f docker-compose.test.yml up -d --build
```

This starts:
- **backend** on port `8000` (accessible at `http://localhost:8000`)
- **postgres_test** on port `5433` (internal test database, separate from any dev database on 5432)

### 3. Run database migrations

The backend container must be running before applying migrations:

```bash
docker compose -f docker-compose.test.yml exec backend uv run alembic upgrade head
```

### 4. Verify the stack is healthy

```bash
curl http://localhost:8000/api/v1/health
# Expected: {"status": "ok", "db": "connected"}
```

### 5. Run end-to-end tests

```bash
cd frontend
npx playwright test
```

### 6. Tear down

```bash
docker compose -f docker-compose.test.yml down
# Add -v to also remove the test database volume:
docker compose -f docker-compose.test.yml down -v
```

### Running a full staging environment

If you want a staging environment that includes the frontend and nginx (closer to production), use the production compose file with a staging `.env`:

```bash
cp .env.example .env.staging
# Edit .env.staging with staging values
docker compose --env-file .env.staging up -d --build
```

---

## Production Deploy

The production stack (`docker-compose.yml`) adds Nginx as a reverse proxy with TLS termination. All HTTP traffic is redirected to HTTPS.

### 1. Provision a server

A small VPS (e.g., DigitalOcean Droplet, Hetzner Cloud CX22) running Ubuntu 22.04 LTS is sufficient for early production. Install Podman and podman-compose. Ubuntu 24.04 LTS is recommended — it ships Podman 4.9.3 natively:

```bash
apt install podman
uv tool install podman-compose
```

If `uv` is not yet installed on the server:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Clone the repo on the server

```bash
git clone https://github.com/your-org/secretsauce.git
cd secretsauce
```

### 3. Create and configure `.env`

```bash
cp .env.example .env
```

Edit `.env` with production values:

```env
DATABASE_URL=postgresql+asyncpg://secretsauce:STRONG_PASSWORD@postgres:5432/secretsauce
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
GEMINI_API_KEY=<your Gemini API key>
UPLOAD_DIR=/tmp/secretsauce-uploads
CORS_ORIGINS=["https://yourdomain.com"]

POSTGRES_USER=secretsauce
POSTGRES_PASSWORD=STRONG_PASSWORD
POSTGRES_DB=secretsauce
```

Use a strong, unique `POSTGRES_PASSWORD` — it must match the password in `DATABASE_URL`.

### 4. Obtain TLS certificates

Use certbot with the standalone plugin (stop any existing nginx first):

```bash
apt install certbot
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

Certificates will be written to `/etc/letsencrypt/live/yourdomain.com/`.

Create the `certs/` directory the compose file expects and symlink the certificates:

```bash
mkdir -p certs
ln -sf /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/cert.pem
ln -sf /etc/letsencrypt/live/yourdomain.com/privkey.pem certs/key.pem
```

### 5. Update nginx.conf for your domain

Edit `nginx/nginx.conf` and replace `server_name _;` with your actual domain:

```nginx
server_name yourdomain.com www.yourdomain.com;
```

### 6. Build the frontend

The nginx service serves the pre-built frontend from `frontend/dist`. Build it before starting the stack:

```bash
cd frontend && npm install && npm run build && cd ..
```

Alternatively, let Docker build it — the `frontend` service Dockerfile builds `dist` internally, and the nginx volume mount `./frontend/dist` will be populated after the frontend container runs its build stage. The easiest approach is to let compose handle it all:

```bash
docker compose up -d --build
```

### 7. Run database migrations

```bash
docker compose exec backend uv run alembic upgrade head
```

### 8. Verify

```bash
curl https://yourdomain.com/api/v1/health
# Expected: {"status": "ok", "db": "connected"}
```

Visit `https://yourdomain.com` in a browser to confirm the frontend loads.

### 9. Create the first superuser

Use the FastAPI users CLI or a direct database call. With the backend container running:

```bash
docker compose exec backend uv run python -c "
import asyncio
from app.core.database import get_async_session
from app.models.user import User
from app.core.security import get_user_manager
# See fastapi-users docs for the create_user helper
"
```

Or register via the UI and then promote the user in the database:

```bash
docker compose exec postgres psql -U secretsauce -d secretsauce \
  -c "UPDATE \"user\" SET is_superuser = true WHERE email = 'you@example.com';"
```

### TLS Certificate Renewal

Certbot auto-renews certificates via a systemd timer. After renewal, nginx needs to reload to pick up the new certs. Add a renewal hook:

```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
docker compose -f /path/to/secretsauce/docker-compose.yml exec nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Database Backups

Set up a daily cron job to dump the database:

```bash
cat > /etc/cron.daily/secretsauce-backup << 'EOF'
#!/bin/bash
BACKUP_DIR=/var/backups/secretsauce
mkdir -p $BACKUP_DIR
docker compose -f /path/to/secretsauce/docker-compose.yml exec -T postgres \
  pg_dump -U secretsauce secretsauce | gzip > $BACKUP_DIR/$(date +%Y%m%d).sql.gz
# Retain 7 daily backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/secretsauce-backup
```

---

## Updating Production

To deploy a new version:

```bash
# On the server, in the repo directory
git pull

# Rebuild and restart (downtime is brief — postgres data is persisted in the volume)
docker compose up -d --build

# Apply any new migrations
docker compose exec backend uv run alembic upgrade head
```

For zero-downtime deploys, see the CI/CD section below.

---

## CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml` in the repository. This pipeline:

1. Runs backend tests and frontend unit tests on every pull request
2. Deploys to production on every push to `main`

### Required GitHub Secrets

In your repository's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `SSH_HOST` | IP address or hostname of your production server |
| `SSH_USER` | SSH username (e.g., `ubuntu` or `deploy`) |
| `SSH_PRIVATE_KEY` | Private SSH key with access to the server |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan your-server-ip` |

### Workflow File

```yaml
# .github/workflows/deploy.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    name: Backend tests
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: secretsauce
          POSTGRES_PASSWORD: secretsauce
          POSTGRES_DB: secretsauce_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          version: "latest"

      - name: Install dependencies
        working-directory: backend
        run: uv sync

      - name: Run tests
        working-directory: backend
        env:
          DATABASE_URL: postgresql+asyncpg://secretsauce:secretsauce@localhost:5432/secretsauce_test
          SECRET_KEY: test-secret-key-for-ci
          GEMINI_API_KEY: test-placeholder
          UPLOAD_DIR: /tmp/secretsauce-uploads
          CORS_ORIGINS: '["http://localhost:5173"]'
        run: uv run pytest --cov=app --cov-report=term-missing

      - name: Lint
        working-directory: backend
        run: uv run ruff check app/

  test-frontend:
    name: Frontend tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        run: corepack enable && corepack prepare pnpm@latest --activate

      - name: Install dependencies
        working-directory: frontend
        run: pnpm install

      - name: Type check
        working-directory: frontend
        run: pnpm run type-check

      - name: Unit tests
        working-directory: frontend
        run: pnpm run test:unit

      - name: Lint
        working-directory: frontend
        run: pnpm run lint

  deploy:
    name: Deploy to production
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          known_hosts: ${{ secrets.SSH_KNOWN_HOSTS }}
          script: |
            set -e
            cd /path/to/secretsauce

            # Pull latest code
            git pull origin main

            # Rebuild and restart containers
            docker compose up -d --build

            # Run any pending migrations
            docker compose exec -T backend uv run alembic upgrade head

            # Confirm health
            sleep 5
            curl -f http://localhost:8000/api/v1/health || exit 1

            echo "Deploy complete"
```

### What the pipeline does

- **On every PR:** runs backend tests (against a real Postgres instance), frontend unit tests, type-checking, and linting. The PR cannot be merged if any step fails.
- **On merge to `main`:** SSHes into the production server, pulls the new code, rebuilds Docker images, applies migrations, and verifies the health endpoint. If the health check fails, the deploy job fails and you can investigate.

### Protecting `main`

In **Settings → Branches**, add a branch protection rule for `main`:

- Require status checks to pass before merging (select `test-backend` and `test-frontend`)
- Require branches to be up to date before merging
- Dismiss stale pull request approvals when new commits are pushed

---

## Running Test and Production on the Same VPS

You can run both a test/staging environment and a production environment concurrently on a single Hetzner VPS. The two stacks use different ports and isolated Docker networks, so they do not interfere with each other.

### Port allocation

| Environment | Service | Port |
|---|---|---|
| Production | Nginx (HTTPS) | 443 |
| Production | Nginx (HTTP → redirect) | 80 |
| Production | Postgres | 5432 (internal only) |
| Test | Backend (HTTP, no TLS) | 8000 |
| Test | Postgres | 5433 (internal only) |

### Directory layout

Use two separate git clones in distinct directories. Each directory is an independent checkout tracking its own branch.

```
/opt/secretsauce/
├── prod/   # tracks main — runs docker-compose.yml
└── test/   # tracks develop — runs docker-compose.test.yml
```

Set this up once on the server:

```bash
# Production clone
git clone https://github.com/your-org/secretsauce.git /opt/secretsauce/prod
cd /opt/secretsauce/prod
git checkout main
cp .env.example .env    # fill in production values

# Test clone
git clone https://github.com/your-org/secretsauce.git /opt/secretsauce/test
cd /opt/secretsauce/test
git checkout develop    # or staging, or whichever branch feeds test
# No .env needed — docker-compose.test.yml hardcodes test credentials
```

Because Docker Compose uses the directory name as the project name, the two stacks get fully isolated container names, networks, and volumes automatically. Verify with:

```bash
docker compose -f /opt/secretsauce/prod/docker-compose.yml ps
docker compose -f /opt/secretsauce/test/docker-compose.test.yml ps
```

### Starting both stacks

```bash
# Production (from prod directory)
cd /opt/secretsauce/prod
docker compose up -d --build
docker compose exec backend uv run alembic upgrade head

# Test (from test directory)
cd /opt/secretsauce/test
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml exec backend uv run alembic upgrade head
```

### Restricting test port access

Port `8000` (the test backend) should not be open to the internet. Use the Hetzner Cloud firewall to restrict it to your IP:

1. In the Hetzner Cloud console, go to **Firewalls → your server's firewall**
2. Add an inbound rule: **TCP port 8000**, source = your IP address only
3. Leave ports 80 and 443 open to all

### Deploying to test only (manual)

To push a new commit to the test environment without touching production:

```bash
# On the server
cd /opt/secretsauce/test

# Pull the latest from the develop branch
git pull origin develop

# Rebuild and restart only the test stack
docker compose -f docker-compose.test.yml up -d --build

# Apply any new migrations to the test database
docker compose -f docker-compose.test.yml exec backend uv run alembic upgrade head

# Verify
curl http://localhost:8000/api/v1/health
```

Production is untouched because it lives in `/opt/secretsauce/prod` and runs a separate Docker project.

### CI/CD: separate deploy jobs per environment

Extend the GitHub Actions workflow with a `deploy-test` job that triggers on pushes to `develop` and a `deploy-production` job that triggers on pushes to `main`. Add two additional secrets to your repository (**Settings → Secrets → Actions**):

| Secret | Value |
|---|---|
| `SSH_HOST` | IP of your VPS (shared between both jobs) |
| `SSH_USER` | SSH username |
| `SSH_PRIVATE_KEY` | Private SSH key |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan your-server-ip` |

Replace the `deploy` job in `.github/workflows/deploy.yml` with these two jobs:

```yaml
  deploy-test:
    name: Deploy to test
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'

    steps:
      - name: Deploy to test environment
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          known_hosts: ${{ secrets.SSH_KNOWN_HOSTS }}
          script: |
            set -e
            cd /opt/secretsauce/test

            git pull origin develop

            docker compose -f docker-compose.test.yml up -d --build
            docker compose -f docker-compose.test.yml exec -T backend uv run alembic upgrade head

            sleep 5
            curl -f http://localhost:8000/api/v1/health || exit 1

            echo "Test deploy complete"

  deploy-production:
    name: Deploy to production
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          known_hosts: ${{ secrets.SSH_KNOWN_HOSTS }}
          script: |
            set -e
            cd /opt/secretsauce/prod

            git pull origin main

            docker compose up -d --build
            docker compose exec -T backend uv run alembic upgrade head

            sleep 5
            curl -f https://yourdomain.com/api/v1/health || exit 1

            echo "Production deploy complete"
```

### Recommended branch workflow

```
feature branches → develop → (review + test deploy) → main → production deploy
```

1. Merge feature branches into `develop`
2. CI runs tests and automatically deploys to the test environment
3. Manually verify at `http://your-server-ip:8000`
4. Open a PR from `develop` → `main` once satisfied
5. Merging to `main` triggers the production deploy automatically

---

## Rollback

If a production deploy goes wrong:

```bash
# On the server — find the previous commit
git log --oneline -5

# Roll back to it
git checkout <previous-commit-sha>

# Rebuild with the old code
docker compose up -d --build

# Downgrade the database if the migration was destructive
docker compose exec backend uv run alembic downgrade -1
```

For database rollbacks, review the migration file in `backend/alembic/versions/` before running downgrade to confirm it is safe.

---

## Troubleshooting

**Backend won't start / health check fails**
```bash
docker compose logs backend
```

**Database connection errors**
- Check `DATABASE_URL` in `.env` uses `postgres` (the service name) as the host, not `localhost`
- Confirm the postgres container is healthy: `docker compose ps`

**Nginx 502 Bad Gateway**
- The backend may still be starting. Wait 15–30 seconds and retry.
- Check `docker compose logs nginx` and `docker compose logs backend`

**Migrations fail**
```bash
docker compose exec backend uv run alembic history
docker compose exec backend uv run alembic current
```

**TLS certificate errors**
- Confirm `certs/cert.pem` and `certs/key.pem` exist and are readable
- Check the symlinks point to the right certbot paths: `ls -la certs/`
