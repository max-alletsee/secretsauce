# Podman Migration Design

**Date:** 2026-04-16
**Scope:** Replace Docker with Podman + podman-compose across local dev (Windows) and production (Linux VPS)
**Approach:** Minimal translation — compose files and Dockerfiles stay structurally identical; only tooling references and nginx ports change

---

## What Changes

### `docker-compose.yml` — nginx port mapping
Rootless Podman on Linux cannot bind to ports below 1024 without a kernel tweak. Nginx port mappings change to unprivileged ports:
- `"80:80"` → `"8080:8080"`
- `"443:443"` → `"8443:8443"`

### `nginx/nginx.conf` — listen directives
Match the new port mappings (container-internal ports must match what nginx actually listens on):
- `listen 80;` → `listen 8080;`
- `listen 443 ssl;` → `listen 8443 ssl;`

### `DEPLOY.md` — prerequisites and all commands
- Prerequisites: Docker 24+ → Podman 4.4+ and podman-compose (installed via `uv tool install podman-compose`)
- Every `docker compose` command → `podman-compose` (with equivalent flags)
- Port allocation table: update production nginx ports to 8080/8443
- Certbot renewal hook: `docker compose exec nginx nginx -s reload` → `podman-compose exec nginx nginx -s reload`
- Any `curl` health check examples against port 80/443 updated to 8080/8443

### `CLAUDE.md` (root) — dev commands and deployment section
- "Full stack (Docker)" section header and commands updated to use `podman-compose`
- Prerequisites in the Deployment section updated

---

## What Does Not Change

- **All three Dockerfiles** — OCI-compatible images, work as-is with Podman's build engine
- **All compose file structure** — services, volumes, networks, healthchecks, environment variables are unchanged
- **`docker-compose.dev.yml`** — only runs postgres; no port conflicts below 1024 (uses 5432); no changes needed beyond command docs
- **`docker-compose.test.yml`** — uses ports 8000 and 5433; no conflicts; no changes needed beyond command docs
- **Backend and frontend application code**
- **nginx proxy logic** — only the listen ports change; all `proxy_pass`, `location`, and TLS config stays the same

---

## Installation Requirements

### Windows (local dev)
- [Podman Desktop](https://podman-desktop.io/) — installs Podman and a WSL2-based Podman Machine
- `uv tool install podman-compose`

### Linux (production)
- Ubuntu 24.04 LTS (Noble) — ships Podman 4.9.3 natively, no third-party repo needed
- `apt install podman`
- `uv tool install podman-compose`

---

## Nginx Port Strategy

The production server exposes ports 8080 (HTTP) and 8443 (HTTPS) instead of 80 and 443. If the server sits behind a cloud firewall or load balancer (e.g., Hetzner Cloud), configure the firewall to forward 80→8080 and 443→8443 at the network level. If accessed directly, clients must use the explicit ports (`https://yourdomain.com:8443`). The DEPLOY.md update will note this.

---

## Out of Scope

- Podman-specific compose options (`userns_mode: keep-id`, `pull_policy`, etc.)
- Podman Quadlets / systemd unit files
- CI/CD pipeline changes (no workflow files are checked in)
- Any application code, environment variables, or Alembic migration changes
