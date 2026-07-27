FROM docker.io/library/node:22-slim AS build

# Install pnpm (pinned — pnpm@latest moved to 11.x which drops Node 20 support
# and is unnecessary churn; 9.x matches the lockfileVersion 9.0)
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json pnpm-lock.yaml .npmrc ./
# --frozen-lockfile: fail loudly if pnpm-lock.yaml is out of sync with
# package.json instead of silently resolving the difference at build time.
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build-only

# Production: copy built assets to a volume-friendly output stage
FROM docker.io/library/busybox AS production
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "cp -r /dist/. /usr/share/nginx/html/ && echo 'Frontend assets copied'"]
