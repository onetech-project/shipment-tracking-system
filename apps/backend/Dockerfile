# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────
FROM node:24.14.1-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install all workspace dependencies
RUN npm ci --workspace=apps/backend --include-workspace-root

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

RUN apt-get update && apt-get install -y --no-install-recommends \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-osd \
  poppler-utils \
  imagemagick \
  libzbar0 \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests for production install
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/backend --include-workspace-root --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY packages/shared/ packages/shared/

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["node", "dist/main"]
