# syntax=docker/dockerfile:1

# ── Stage 1: Dependencies ─────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/frontend --include-workspace-root

# ── Stage 2: Build ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/frontend/ apps/frontend/
COPY packages/shared/ packages/shared/
COPY package.json ./

WORKDIR /app/apps/frontend

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Production ───────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static apps/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public apps/frontend/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/frontend/server.js"]
