# shipment-tracking-system Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-08

## Active Technologies
- TypeScript 5.x, Node.js ≥ 20 LTS + NestJS 10.4, TypeORM 0.3.20, googleapis, @nestjs/schedule, @nestjs/websockets, @nestjs/platform-socket.io, socket.io (backend), socket.io-client (frontend) (004-google-sheets-postgresql-sync)
- PostgreSQL 16.x — air_shipments_cgk, air_shipments_sub, air_shipments_sda, rate_per_station, route_master tables (004-google-sheets-postgresql-sync)
- TypeScript 5.x, Node.js ≥ 20 LTS + NestJS 10.4, TypeORM 0.3.20, BullMQ, pdf2json (new), pdf-parse (existing), jsQR (frontend) (002-pdf-upload-qr-scan)
- PostgreSQL 16.x (TypeORM migrations), Redis 7.x (BullMQ) (002-pdf-upload-qr-scan)
- TypeScript 5.5, Next.js 14 (App Router), React 18 (003-modern-dashboard-ui)
- N/A — UI-only change; no database schema changes (003-modern-dashboard-ui)

- TypeScript 5.x + NestJS 10.x + Next.js 14.x + PostgreSQL 16 + TypeORM (001-auth-rbac-multi-organization)
- TypeScript 5.5.x + NestJS 10.x + Next.js 14.x + PostgreSQL 16 + TypeORM + BullMQ + pdf-parse/pdfjs-dist + jsqr (002-pdf-upload-qr-scan)

## Project Structure

```text
apps/
  backend/
    src/
      modules/
        auth/
        organizations/
        users/
        roles/
        permissions/
        invitations/
        audit/
        shipments/
      database/
        migrations/
  frontend/
    src/
      features/
        auth/
        organizations/
        users/
        roles/
        invitations/
        shipments/
      app/
packages/
  shared/
    src/
      auth/
      shipments/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript: Follow standard conventions. Use strict mode. Prefer interfaces over types for object shapes. NestJS modules with providers/controllers/services pattern. TypeORM entities with decorators. Jest for unit and e2e tests.

## Recent Changes
- 004-google-sheets-postgresql-sync: Added googleapis, @nestjs/schedule, @nestjs/websockets, @nestjs/platform-socket.io, socket.io (backend), socket.io-client (frontend); new AirShipmentsModule with sync service, WebSocket gateway, and five dashboard pages
- 003-modern-dashboard-ui: Added TypeScript 5.5, Next.js 14 (App Router), React 18
- 002-pdf-upload-qr-scan: Added TypeScript 5.x, Node.js ≥ 20 LTS + NestJS 10.4, TypeORM 0.3.20, BullMQ, pdf2json (new), pdf-parse (existing), jsQR (frontend)

- 001-auth-rbac-multi-organization: Added TypeScript 5.x + NestJS 10.x + Next.js 14.x + PostgreSQL 16 + TypeORM

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
