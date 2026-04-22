FROM docker.io/library/node:20-slim AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --no-frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build-only

# Production: copy built assets to a volume-friendly output stage
FROM docker.io/library/busybox AS production
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "cp -r /dist/. /usr/share/nginx/html/ && echo 'Frontend assets copied'"]
