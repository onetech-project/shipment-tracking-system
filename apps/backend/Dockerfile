# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────
FROM node:24.14.1-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install all workspace dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/backend --include-workspace-root

# Copy source
COPY apps/backend/ apps/backend/
COPY packages/shared/ packages/shared/

# Build
WORKDIR /app/apps/backend
RUN npm run build

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

# Copy pre-built node_modules from builder (avoids second npm ci + compiler toolchain)
# npm workspace hoisting puts everything in root node_modules; the workspace-local
# directory only exists for version conflict overrides
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY apps/backend/package.json apps/backend/

# Copy compiled output
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY packages/shared/ packages/shared/

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["node", "dist/main"]
