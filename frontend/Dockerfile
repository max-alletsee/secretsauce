FROM node:20-slim AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --no-frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build-only

# Production: serve static build with Nginx
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx config will be provided by docker-compose volume mount
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
