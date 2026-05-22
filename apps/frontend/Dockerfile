# syntax=docker/dockerfile:1

# ── Stage 1: Dependencies ─────────────────────────────────
FROM node:24.14.0-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/frontend --include-workspace-root

# ── Stage 2: Build ────────────────────────────────────────
FROM node:24.14.0-alpine AS builder

# Build-time environment variables (CRA reads REACT_APP_* at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/frontend/ apps/frontend/
COPY packages/shared/ packages/shared/
COPY package.json ./

WORKDIR /app/apps/frontend

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Production ───────────────────────────────────
FROM node:24.14.0-alpine AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output does not self-bundle workspace-level packages (e.g. next) without
# outputFileTracingRoot set — copy workspace node_modules first, then overlay standalone
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./.next/static
# COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public apps/frontend/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
