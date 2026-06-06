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
podman-compose -f docker-compose.test.yml up -d --build
```

This starts:
- **backend** on port `8000` (accessible at `http://localhost:8000`)
- **postgres_test** on port `5433` (internal test database, separate from any dev database on 5432)

### 3. Run database migrations

The backend container must be running before applying migrations:

```bash
podman-compose -f docker-compose.test.yml exec backend uv run alembic upgrade head
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
podman-compose -f docker-compose.test.yml down
# Add -v to also remove the test database volume:
podman-compose -f docker-compose.test.yml down -v
```

### Running a full staging environment

If you want a staging environment that includes the frontend and nginx (closer to production), use the production compose file with a staging `.env`:

```bash
cp .env.example .env.staging
# Edit .env.staging with staging values
podman-compose --env-file .env.staging up -d --build
```

---

## Production Deploy

The production stack (`docker-compose.yml`) adds Nginx as a reverse proxy with TLS termination. All HTTP traffic is redirected to HTTPS.

### 1. Provision a server

A small VPS (e.g., DigitalOcean Droplet, Hetzner Cloud CX22) running Ubuntu 24.04 LTS is recommended — it ships Podman 4.9.3 natively. 

SSH into the server:

```bash
ssh root@<your-server-ip>
```

> **IPv6-only servers:** Hetzner CX servers are IPv6-only by default. Many services (including GitHub) do not support IPv6, so the server needs a NAT64/DNS64 gateway to reach them. Hetzner's built-in DNS64 servers are unreliable — use Google's instead. Edit the netplan config:
>
> ```bash
> nano /etc/netplan/50-cloud-init.yaml
> ```
>
> Replace the `nameservers` block with:
>
> ```yaml
>       nameservers:
>         addresses:
>         - 2001:4860:4860::6464
>         - 2001:4860:4860::64
> ```
>
> Apply the change:
>
> ```bash
> netplan apply
> ```
>
> You only need to do this once. After this, `curl`, `git clone`, and `apt` will all reach IPv4 hosts normally via NAT64.

Install Podman system-wide (as root):

```bash
apt install podman
```

#### Rootless setup (recommended)

Running Podman rootless means container processes run as an unprivileged user. A container breakout yields only that user account, not root on the host. The ports used by this stack (8080, 8443, 8000) are all above 1024, so rootless binding works without any special kernel configuration.

**Create a dedicated deploy user and enable linger** (linger allows containers to keep running after you log out):

```bash
useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
loginctl enable-linger deploy
```

**Install uv and podman-compose as the deploy user:**

```bash
su - deploy
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/bin/env  # reload PATH so uv is available in the current shell
uv tool install podman-compose
exit  # back to root
```

All subsequent steps in this section (clone, `.env`, compose commands, migrations) should be run as the `deploy` user:

```bash
su - deploy
```

### 2. Clone the repo on the server

```bash
git clone https://github.com/max-alletsee/secretsauce.git
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
CORS_ORIGINS=["https://secretsauce.food"]

POSTGRES_USER=secretsauce
POSTGRES_PASSWORD=STRONG_PASSWORD
POSTGRES_DB=secretsauce
```

Use a strong, unique `POSTGRES_PASSWORD` — it must match the password in `DATABASE_URL`.

### 4. Obtain TLS certificates

Use certbot with the standalone plugin (run as root — certbot requires root).

**Install certbot via snap, not apt.** The apt version (2.9.0) shipped with Ubuntu 24.04 has a bug where it fails with "No such authorization" when fetching ACME authorizations from Let's Encrypt's Boulder server. The snap version (3.x) fixes this.

```bash
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot
apt install acl
certbot certonly --standalone -d secretsauce.food -d www.secretsauce.food
```

Certificates will be written to `/etc/letsencrypt/live/secretsauce.food/`.

**Copy the certificates into the repo's `certs/` directory** (as root). Do not use symlinks — the nginx process runs inside a rootless Podman container with remapped UIDs and cannot follow symlinks into `/etc/letsencrypt/`:

```bash
mkdir -p /home/deploy/secretsauce/certs
cp /etc/letsencrypt/live/secretsauce.food/fullchain.pem /home/deploy/secretsauce/certs/cert.pem
cp /etc/letsencrypt/live/secretsauce.food/privkey.pem /home/deploy/secretsauce/certs/key.pem
chown deploy:deploy /home/deploy/secretsauce/certs/*.pem
chmod 644 /home/deploy/secretsauce/certs/cert.pem
chmod 600 /home/deploy/secretsauce/certs/key.pem
```

Update the renewal hook to copy instead of reload, so renewed certs are picked up automatically (run as root):

```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/copy-certs.sh << 'EOF'
#!/bin/bash
cp /etc/letsencrypt/live/secretsauce.food/fullchain.pem /home/deploy/secretsauce/certs/cert.pem
cp /etc/letsencrypt/live/secretsauce.food/privkey.pem /home/deploy/secretsauce/certs/key.pem
chown deploy:deploy /home/deploy/secretsauce/certs/*.pem
chmod 644 /home/deploy/secretsauce/certs/cert.pem
chmod 600 /home/deploy/secretsauce/certs/key.pem
su - deploy -c "cd /home/deploy/secretsauce && podman-compose exec nginx nginx -s reload"
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-certs.sh
```

### 5. Update nginx.conf for your domain

Edit `nginx/nginx.conf` (full path: `/home/deploy/secretsauce/nginx/nginx.conf`) and replace `server_name _;` with your actual domain:

```bash
nano /home/deploy/secretsauce/nginx/nginx.conf
```

```nginx
server_name secretsauce.food www.secretsauce.food;
```

### 6. Build the frontend

The nginx service serves the pre-built frontend from `frontend/dist`. Build it before starting the stack:

```bash
cd frontend && npm install && npm run build && cd ..
```

Alternatively, let Podman build it — the `frontend` service Dockerfile builds `dist` internally, and the nginx volume mount `./frontend/dist` will be populated after the frontend container runs its build stage. The easiest approach is to let podman-compose handle it all:

```bash
podman-compose up -d --build
```

If a container is already running, it may be necessary to first stop it altogether and restart it: 

```bash
podman-compose down && podman-compose up -d
```

### 7. Run database migrations

```bash
podman-compose exec backend uv run alembic upgrade head
```

### 8. Verify

```bash
curl https://secretsauce.food:8443/api/v1/health
# Expected: {"status": "ok", "db": "connected"}
```

Visit `https://secretsauce.food:8443` in a browser to confirm the frontend loads.

### 9. Create the first superuser

Register an account via the registration page (`https://yourdomain.com:8443/register`), then promote it to superuser via the database. Run from the repo directory:

```bash
podman-compose exec postgres psql -U secretsauce -d secretsauce -c "UPDATE users SET is_superuser = true WHERE email = 'you@example.com';"
```

### TLS Certificate Renewal

Certbot auto-renews certificates via a systemd timer. The renewal hook created in Step 4 (`copy-certs.sh`) copies the renewed files into `certs/` and signals nginx to reload — no further setup needed.

### Database Backups

Set up a daily cron job to dump the database. Run this as the `deploy` user (`crontab -e`), not in `/etc/cron.daily` — rootless Podman containers are only accessible to the user who started them:

```bash
# Run as deploy user: crontab -e
0 2 * * * BACKUP_DIR=/home/deploy/backups/secretsauce && mkdir -p $BACKUP_DIR && cd /home/deploy/secretsauce/prod && podman-compose exec -T postgres pg_dump -U secretsauce secretsauce | gzip > $BACKUP_DIR/$(date +\%Y\%m\%d).sql.gz && find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

---

## Updating Production

To deploy a new version:

```bash
# On the server, in the repo directory
git pull

# Rebuild and restart (downtime is brief — postgres data is persisted in the volume)
podman-compose up -d --build

# Apply any new migrations
podman-compose exec backend uv run alembic upgrade head
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
| `SSH_USER` | `deploy` (the rootless user created in Step 1) |
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
            cd /home/deploy/secretsauce/prod

            # Pull latest code
            git pull origin main

            # Rebuild and restart containers
            podman-compose up -d --build

            # Run any pending migrations
            podman-compose exec -T backend uv run alembic upgrade head

            # Confirm health
            sleep 5
            curl -f http://localhost:8000/api/v1/health || exit 1

            echo "Deploy complete"
```

### What the pipeline does

- **On every PR:** runs backend tests (against a real Postgres instance), frontend unit tests, type-checking, and linting. The PR cannot be merged if any step fails.
- **On merge to `main`:** SSHes into the production server, pulls the new code, rebuilds container images, applies migrations, and verifies the health endpoint. If the health check fails, the deploy job fails and you can investigate.

### Protecting `main`

In **Settings → Branches**, add a branch protection rule for `main`:

- Require status checks to pass before merging (select `test-backend` and `test-frontend`)
- Require branches to be up to date before merging
- Dismiss stale pull request approvals when new commits are pushed

---

## Running Test and Production on the Same VPS

You can run both a test/staging environment and a production environment concurrently on a single Hetzner VPS. The two stacks use different ports and isolated Podman networks, so they do not interfere with each other.

### Port allocation

| Environment | Service | Port |
|---|---|---|
| Production | Nginx (HTTPS) | 8443 |
| Production | Nginx (HTTP → redirect) | 8080 |
| Production | Postgres | 5432 (internal only) |
| Test | Backend (HTTP, no TLS) | 8000 |
| Test | Postgres | 5433 (internal only) |

### Directory layout

Use two separate git clones in distinct directories. Each directory is an independent checkout tracking its own branch.

```
/home/deploy/secretsauce/
├── prod/   # tracks main — runs docker-compose.yml
└── test/   # tracks develop — runs docker-compose.test.yml
```

Set this up once on the server as the `deploy` user:

```bash
# Production clone
git clone https://github.com/your-org/secretsauce.git /home/deploy/secretsauce/prod
cd /home/deploy/secretsauce/prod
git checkout main
cp .env.example .env    # fill in production values

# Test clone
git clone https://github.com/your-org/secretsauce.git /home/deploy/secretsauce/test
cd /home/deploy/secretsauce/test
git checkout develop    # or staging, or whichever branch feeds test
# No .env needed — docker-compose.test.yml hardcodes test credentials
```

Because podman-compose uses the directory name as the project name, the two stacks get fully isolated container names, networks, and volumes automatically. Verify with:

```bash
podman-compose -f /home/deploy/secretsauce/prod/docker-compose.yml ps
podman-compose -f /home/deploy/secretsauce/test/docker-compose.test.yml ps
```

### Starting both stacks

Run these as the `deploy` user:

```bash
# Production (from prod directory)
cd /home/deploy/secretsauce/prod
podman-compose up -d --build
podman-compose exec backend uv run alembic upgrade head

# Test (from test directory)
cd /home/deploy/secretsauce/test
podman-compose -f docker-compose.test.yml up -d --build
podman-compose -f docker-compose.test.yml exec backend uv run alembic upgrade head
```

### Restricting test port access

Port `8000` (the test backend) should not be open to the internet. Use the Hetzner Cloud firewall to restrict it to your IP:

1. In the Hetzner Cloud console, go to **Firewalls → your server's firewall**
2. Add an inbound rule: **TCP port 8000**, source = your IP address only
3. Add inbound rules for **TCP port 8080** and **TCP port 8443** open to all (nginx listens on these ports in rootless Podman mode)

### Deploying to test only (manual)

To push a new commit to the test environment without touching production:

```bash
# On the server, as the deploy user
cd /home/deploy/secretsauce/test

# Pull the latest from the develop branch
git pull origin develop

# Rebuild and restart only the test stack
podman-compose -f docker-compose.test.yml up -d --build

# Apply any new migrations to the test database
podman-compose -f docker-compose.test.yml exec backend uv run alembic upgrade head

# Verify
curl http://localhost:8000/api/v1/health
```

Production is untouched because it lives in `/home/deploy/secretsauce/prod` and runs a separate podman-compose project.

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
            cd /home/deploy/secretsauce/test

            git pull origin develop

            podman-compose -f docker-compose.test.yml up -d --build
            podman-compose -f docker-compose.test.yml exec -T backend uv run alembic upgrade head

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
            cd /home/deploy/secretsauce/prod

            git pull origin main

            podman-compose up -d --build
            podman-compose exec -T backend uv run alembic upgrade head

            sleep 5
            curl -f https://yourdomain.com:8443/api/v1/health || exit 1

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

If a production deploy goes wrong, run as the `deploy` user:

```bash
cd /home/deploy/secretsauce/prod

# Find the previous commit
git log --oneline -5

# Roll back to it
git checkout <previous-commit-sha>

# Rebuild with the old code
podman-compose up -d --build

# Downgrade the database if the migration was destructive
podman-compose exec backend uv run alembic downgrade -1
```

For database rollbacks, review the migration file in `backend/alembic/versions/` before running downgrade to confirm it is safe.

---

## Troubleshooting

**Backend won't start / health check fails**
```bash
podman-compose logs backend
```

**Database connection errors**
- Check `DATABASE_URL` in `.env` uses `postgres` (the service name) as the host, not `localhost`
- Confirm the postgres container is healthy: `podman-compose ps`

**Nginx 502 Bad Gateway**
- The backend may still be starting. Wait 15–30 seconds and retry.
- Check `podman-compose logs nginx` and `podman-compose logs backend`

**Migrations fail**
```bash
podman-compose exec backend uv run alembic history
podman-compose exec backend uv run alembic current
```

**TLS certificate errors / nginx won't start**
- Confirm `certs/cert.pem` and `certs/key.pem` exist: `ls -la certs/`
- Do not use symlinks into `/etc/letsencrypt/` — rootless Podman containers remap UIDs and cannot read through them. Copy the files as described in Step 4.
- Verify the deploy user owns the files: `stat certs/cert.pem`
