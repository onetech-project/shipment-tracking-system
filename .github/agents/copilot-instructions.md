# shipment-tracking-system Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-07-15

## Active Technologies

- TypeScript 5.x + NestJS 10.x + Next.js 14.x + PostgreSQL 16 + TypeORM (001-auth-rbac-multi-organization)

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
      app/
packages/
  shared/
    src/
      auth/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript: Follow standard conventions. Use strict mode. Prefer interfaces over types for object shapes. NestJS modules with providers/controllers/services pattern. TypeORM entities with decorators. Jest for unit and e2e tests.

## Recent Changes

- 001-auth-rbac-multi-organization: Added TypeScript 5.x + NestJS 10.x + Next.js 14.x + PostgreSQL 16 + TypeORM

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
