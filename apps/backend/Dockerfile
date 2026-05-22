# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────
FROM node:24.14.1-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter=apps/backend

COPY apps/backend/ apps/backend/
COPY packages/shared/ packages/shared/

WORKDIR /app/apps/backend
RUN pnpm run build

# ── Stage 2: Production ───────────────────────────────────
FROM node:24.14.1-slim AS production

ENV NODE_ENV=production

WORKDIR /app

# Only runtime tools needed — build-essential/python3 not required since
# node_modules (including bcrypt native binaries) are copied from builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    postgresql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime && echo ${TZ} > /etc/timezone

# Copy pre-built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY apps/backend/package.json apps/backend/

# Copy compiled output
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY packages/shared/ packages/shared/

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["node", "dist/main"]
