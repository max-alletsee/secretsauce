# Podman Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Docker tooling references with Podman + podman-compose across config files and documentation, and adjust nginx to listen on unprivileged ports for rootless Podman.

**Architecture:** Minimal translation — Dockerfiles are unchanged (already OCI-compatible and non-root). The three compose files keep their structure; only nginx port mappings change. All `docker compose` references in CLAUDE.md and DEPLOY.md are replaced with `podman-compose`.

**Tech Stack:** Podman 4.4+ (Ubuntu 24.04 ships 4.9.3 natively), podman-compose (installed via `uv tool install podman-compose`), Podman Desktop on Windows

**Spec:** `docs/superpowers/specs/2026-04-16-podman-migration-design.md`

---

## Files Modified

| File | Change |
|---|---|
| `nginx/nginx.conf` | `listen 80` → `listen 8080`, `listen 443 ssl` → `listen 8443 ssl` |
| `docker-compose.yml` | nginx port mappings: `80:80` → `8080:8080`, `443:443` → `8443:8443` |
| `CLAUDE.md` | "Full stack (Docker)" section: `docker compose` → `podman-compose` |
| `DEPLOY.md` | Prerequisites, every `docker compose` command, port table, curl examples, certbot hook, backup cron, CI/CD scripts |

---

## Task 1: Update nginx listen ports

**Files:**
- Modify: `nginx/nginx.conf`
- Modify: `docker-compose.yml`

Rootless Podman cannot bind to ports below 1024. Both the nginx config (container-internal) and the compose port mapping (host:container) must be updated together.

- [ ] **Step 1: Update nginx/nginx.conf**

Replace the entire file content:

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Redirect HTTP to HTTPS
    server {
        listen 8080;
        server_name _;
        return 301 https://$host:8443$request_uri;
    }

    server {
        listen 8443 ssl;
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

- [ ] **Step 2: Update docker-compose.yml nginx port mappings**

In `docker-compose.yml`, change the nginx `ports` block:

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "8080:8080"
      - "8443:8443"
```

Everything else in `docker-compose.yml` stays unchanged.

- [ ] **Step 3: Commit**

```bash
git add nginx/nginx.conf docker-compose.yml
git commit -m "fix: update nginx to listen on unprivileged ports 8080/8443 for rootless Podman"
```

---

## Task 2: Update CLAUDE.md dev commands

**Files:**
- Modify: `CLAUDE.md`

The "Full stack (Docker)" section in CLAUDE.md references `docker compose`. Replace all occurrences with `podman-compose`.

- [ ] **Step 1: Update the Full stack section**

Find the section that reads:
```markdown
### Full stack (Docker)
```bash
# Start production stack
docker compose up --build

# Start test stack (used for Playwright e2e tests)
docker compose -f docker-compose.test.yml up -d

# Run e2e tests (requires test stack running)
cd frontend && npx playwright test

# Run a single e2e test
npx playwright test e2e/recipes.spec.ts
```
```

Replace it with:
```markdown
### Full stack (Podman)
```bash
# Start production stack
podman-compose up --build

# Start test stack (used for Playwright e2e tests)
podman-compose -f docker-compose.test.yml up -d

# Run e2e tests (requires test stack running)
cd frontend && npx playwright test

# Run a single e2e test
npx playwright test e2e/recipes.spec.ts
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: replace docker compose with podman-compose in CLAUDE.md"
```

---

## Task 3: Update DEPLOY.md — prerequisites and installation

**Files:**
- Modify: `DEPLOY.md`

The prerequisites block at the top of DEPLOY.md and the "Provision a server" step both reference Docker. Update them.

- [ ] **Step 1: Update the Prerequisites section**

Find:
```markdown
- **Docker** 24+ and **Docker Compose** v2 (`docker compose`, not `docker-compose`)
```

Replace with:
```markdown
- **Podman** 4.4+ and **podman-compose**
  - Windows (local dev): [Podman Desktop](https://podman-desktop.io/) + `uv tool install podman-compose`
  - Linux (production): Ubuntu 24.04 LTS ships Podman 4.9.3 natively — `apt install podman` + `uv tool install podman-compose`
```

- [ ] **Step 2: Update the "Provision a server" step**

Find (under "Production Deploy → 1. Provision a server"):
```markdown
Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```
```

Replace with:
```markdown
Install Podman and podman-compose. Ubuntu 24.04 LTS is recommended — it ships Podman 4.9.3 natively:

```bash
apt install podman
uv tool install podman-compose
```

If `uv` is not yet installed on the server:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: update DEPLOY.md prerequisites and server setup for Podman"
```

---

## Task 4: Update DEPLOY.md — all docker compose commands

**Files:**
- Modify: `DEPLOY.md`

Every `docker compose` command in DEPLOY.md becomes `podman-compose`. Also update health check URLs that reference port 80/443 to use 8080/8443, and update the port allocation table.

- [ ] **Step 1: Replace all `docker compose` with `podman-compose`**

Do a global find-and-replace in `DEPLOY.md`:
- `docker compose` → `podman-compose`

This covers all command blocks: test stack startup, exec commands, migration runs, backup cron, certbot hook, rollback steps, CI/CD script blocks, and the troubleshooting section.

Verify with:
```bash
grep -n "docker compose" DEPLOY.md
```
Expected: no matches.

- [ ] **Step 2: Update health check URLs to use port 8443**

Find:
```markdown
curl https://yourdomain.com/api/v1/health
# Expected: {"status": "ok", "db": "connected"}
```

Replace with:
```markdown
curl https://yourdomain.com:8443/api/v1/health
# Expected: {"status": "ok", "db": "connected"}
```

Also find the curl in the CI/CD deploy script block:
```bash
curl -f https://yourdomain.com/api/v1/health || exit 1
```
Replace with:
```bash
curl -f https://yourdomain.com:8443/api/v1/health || exit 1
```

- [ ] **Step 3: Update the port allocation table**

Find the port allocation table (under "Running Test and Production on the Same VPS"):
```markdown
| Production | Nginx (HTTPS) | 443 |
| Production | Nginx (HTTP → redirect) | 80 |
```

Replace with:
```markdown
| Production | Nginx (HTTPS) | 8443 |
| Production | Nginx (HTTP → redirect) | 8080 |
```

- [ ] **Step 4: Update the HTTP redirect in the nginx config note**

The DEPLOY.md "Update nginx.conf for your domain" section shows a snippet. Find any mention of ports 80 or 443 in inline nginx config examples within DEPLOY.md and update them to 8080/8443 to stay consistent with the actual `nginx/nginx.conf`.

Search for any remaining port 80/443 references:
```bash
grep -n "\b80\b\|\b443\b" DEPLOY.md
```

Review each match. Update any that refer to nginx listen/expose ports. Do not change references that are about something else (e.g., the Hetzner firewall rule for "leave ports 80 and 443 open to all" — this is host-level firewall config for direct internet traffic, which may still be relevant if using a firewall/load balancer to forward to 8080/8443; update the wording to clarify).

Find the Hetzner firewall note:
```markdown
2. Add an inbound rule: **TCP port 8000**, source = your IP address only
3. Leave ports 80 and 443 open to all
```

Replace with:
```markdown
2. Add an inbound rule: **TCP port 8000**, source = your IP address only
3. Add inbound rules for **TCP port 8080** and **TCP port 8443** open to all (nginx listens on these ports in rootless Podman mode)
```

- [ ] **Step 5: Update the certbot renewal hook**

Find:
```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
docker compose -f /path/to/secretsauce/docker-compose.yml exec nginx nginx -s reload
EOF
```

This will already have `podman-compose` from the global replace in Step 1. Verify it reads:
```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
podman-compose -f /path/to/secretsauce/docker-compose.yml exec nginx nginx -s reload
EOF
```

- [ ] **Step 6: Verify no `docker` references remain**

```bash
grep -n "\bdocker\b" DEPLOY.md
```
Expected: no matches (other than any URLs or quoted text that intentionally reference Docker concepts).

- [ ] **Step 7: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: replace all docker compose commands with podman-compose in DEPLOY.md"
```
