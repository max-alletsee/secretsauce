#!/usr/bin/env bash
# Production deploy for secretsauce.food. Run as the deploy user from the repo root.
#
# Why not just `podman-compose up -d --build`? podman-compose rebuilds images
# but does NOT recreate existing containers — they keep running the image they
# were created from, so such a deploy silently ships nothing (July 2026:
# production served a two-month-old frontend bundle this way). Containers must
# be torn down and recreated, and the result verified against the images that
# were just built.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH" # podman-compose lives here (uv tool install)
cd "$(dirname "$0")"
PROJECT="$(basename "$PWD")" # podman-compose names resources <dir>_<service>_1

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Backing up database"
BACKUP_DIR="$HOME/backups/secretsauce"
mkdir -p "$BACKUP_DIR"
if podman container exists "${PROJECT}_postgres_1" &&
    [ "$(podman inspect -f '{{.State.Running}}' "${PROJECT}_postgres_1")" = "true" ]; then
    podman exec -i "${PROJECT}_postgres_1" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' |
        gzip >"$BACKUP_DIR/$(date +%Y%m%d-%H%M%S).sql.gz"
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +14 -delete
else
    echo "WARNING: postgres container not running — skipping backup"
fi

echo "==> Building images (old stack keeps serving during the build)"
podman-compose build

echo "==> Recreating containers from the new images"
podman-compose down
podman-compose up -d

echo "==> Applying database migrations"
podman-compose exec -T backend uv run alembic upgrade head

echo "==> Verifying deploy"
sleep 5
curl -skf https://localhost/api/v1/health | grep -q '"status":"ok"' ||
    { echo "DEPLOY FAILED: health check" >&2; exit 1; }

# The bundle nginx serves must be the one inside the image we just built —
# this is exactly the check that catches a stale-container/stale-volume deploy.
built=$(podman run --rm "localhost/${PROJECT}_frontend:latest" grep -o 'index-[^"]*\.js' /dist/index.html)
served=$(curl -sk https://localhost/ | grep -o 'index-[^"]*\.js')
if [ "$built" != "$served" ]; then
    echo "DEPLOY FAILED: nginx serves stale frontend bundle (built $built, serving $served)" >&2
    exit 1
fi

# The running backend must be on the image that was just built.
running=$(podman inspect -f '{{.Image}}' "${PROJECT}_backend_1")
latest=$(podman image inspect -f '{{.Id}}' "localhost/${PROJECT}_backend:latest")
if [ "$running" != "$latest" ]; then
    echo "DEPLOY FAILED: backend container is not running the freshly built image" >&2
    exit 1
fi

podman image prune -f >/dev/null

echo "==> Deploy complete — serving $served"
