# Swagger / OpenAPI Documentation — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)
**Scope:** `apps/backend` (NestJS)

## Problem

The backend exposes ~86 endpoints across 12 controllers with a working
authentication/authorization layer, but has no API documentation. We want
interactive Swagger UI that **faithfully mirrors the existing public/private
split** without re-implementing or duplicating auth logic.

## Existing auth model (unchanged by this work)

- **Authentication:** global `JwtAuthGuard` registered via `APP_GUARD`. Access
  token is a **Bearer JWT** (`Authorization: Bearer <token>`), extracted by
  `JwtStrategy` via `ExtractJwt.fromAuthHeaderAsBearerToken()`. Refresh token is
  an httpOnly cookie (out of scope for the Swagger security scheme).
- **Public opt-out:** `@Public()` sets `IS_PUBLIC_KEY` metadata; `JwtAuthGuard`
  skips those routes. Current public routes: `GET /health`, `POST /auth/login`,
  `POST /auth/refresh`, `POST /invitations/accept`.
- **Authorization:** `@Authorize(Permission.X)` sets `PERMISSION_KEY` metadata
  and applies `RbacGuard`. Super admin bypasses all checks.

This design **reads** that existing metadata; it does not change any guard,
decorator behavior, or route protection.

## Decisions (from brainstorming)

1. **Doc fidelity:** Auto — use the `@nestjs/swagger` CLI plugin to infer DTO
   schemas from existing TypeScript types + `class-validator` decorators. Add
   light per-controller `@ApiTags`. No hand-written `@ApiProperty` on every DTO.
2. **UI access:** Swagger UI is **fully public** at `/api/docs`. No basic auth,
   no production gating. (Accepted trade-off — see below.)
3. **RBAC docs:** Auto — surface the required permission from `@Authorize` in
   each operation's description.

## Approach (chosen: centralized post-processor)

Set a document-level default `bearerAuth` security requirement, then centrally
reconcile each operation against the *existing* route metadata:

- **Public** operation → clear security (`security: []`) so it renders without a
  lock and needs no token in "Try it out".
- **`@Authorize`** operation → append `**Requires permission:** \`<perm>\`` to
  the operation description.

This requires **zero edits to the 86 endpoints** and cannot drift from the
guards, because it is driven by the same metadata the guards consume.

Rejected alternatives:
- **Per-endpoint decorators** (`@ApiBearerAuth`/exclusions on all handlers):
  86-endpoint touch, drifts from guards.
- **Fold Swagger metadata into `Public()`/`Authorize()`:** misses private routes
  with no `@Authorize` (e.g. `logout`, `me`) — they'd render unlocked.

## Components

### 1. Dependency
Add `@nestjs/swagger` (v7.x, compatible with NestJS 10) to `apps/backend`.
It bundles swagger-ui-express; no separate UI dependency needed. Install with
`pnpm`.

### 2. `apps/backend/nest-cli.json`
Add the swagger plugin under `compilerOptions.plugins`:

```json
"plugins": [
  { "name": "@nestjs/swagger", "options": { "classValidatorShim": true } }
]
```

The custom `webpack.config.js` spreads `...options`, preserving the Nest-injected
plugin transformer, so the webpack build continues to work. Existing
`deleteOutDir` / `webpack` / `webpackConfigPath` settings are kept.

### 3. `apps/backend/src/common/swagger/setup-swagger.ts` (new, isolated)

Single responsibility: build and mount the OpenAPI document. Exports
`setupSwagger(app: INestApplication): void`.

Steps:
1. Build config via `DocumentBuilder`
   - title / description / version
   - `.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')`
2. `SwaggerModule.createDocument(app, config, { operationIdFactory: (controllerKey, methodKey) => \`${controllerKey}.${methodKey}\` })`
3. Default security for every operation: `document.security = [{ 'access-token': [] }]`
4. **Post-process:** use `DiscoveryService` + `MetadataScanner` (`@nestjs/core`)
   to build a map `\`${ControllerName}.${methodName}\` → { isPublic, permission }`
   by reflecting `IS_PUBLIC_KEY` and `PERMISSION_KEY` (method-level, falling back
   to class-level). Walk `document.paths[path][method]`, key on `operationId`:
   - `isPublic` → `operation.security = []`
   - `permission` → append the permission line to `operation.description`
5. `SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } })`
   → UI at `/api/docs`, JSON at `/api/docs-json`.

### 4. `apps/backend/src/main.ts`
Call `setupSwagger(app)` after `setGlobalPrefix('api')` and before
`app.listen(...)`.

**Global-prefix correctness:** "Try it out" requests must resolve to `/api/...`.
This will be verified at runtime; if the generated paths do not already include
the global prefix, add `.addServer('/api')` to the builder. Confirmed working
before the feature is considered done.

### 5. Light per-controller touches
- Add `@ApiTags('<name>')` to each of the 12 controllers for clean grouping.
- Optional small `LoginResponseDto` (`{ accessToken: string; user: ... }`) so the
  login response schema documents the token field used for authorization.

## Data flow

```
setGlobalPrefix('api')
  → DocumentBuilder (defines 'access-token' bearer scheme)
  → createDocument (operationId = Controller.method)
  → document.security = [{ 'access-token': [] }]   // default: locked
  → DiscoveryService reflects @Public()/@Authorize() metadata
  → post-process each operation:
        public   → security = []                    // unlocked
        @Authorize → description += required permission
  → SwaggerModule.setup('api/docs', ...)
```

## Error handling
- Post-processor tolerates operations whose `operationId` is absent from the map
  (leaves default security untouched) — no throw.
- Missing/renamed metadata keys degrade gracefully to "locked, no permission
  note" rather than crashing bootstrap.

## Testing
- **Unit** (`setup-swagger.spec.ts` logic): feed the post-processing function a
  fake OpenAPI document plus a stub metadata map; assert:
  - public op → `security === []`
  - `@Authorize` op → `security` unchanged and description contains the permission
  - unknown op → unchanged
- **Smoke:** with the app running, `GET /api/docs` → 200 HTML; `GET /api/docs-json`
  → `paths['/auth/login'].post.security === []`; a private route (e.g. users list)
  keeps `[{ 'access-token': [] }]` and shows the permission in its description.

## Accepted trade-off
Fully public UI exposes the entire API schema (all endpoints + DTO shapes) to
anyone who can reach the server. This was chosen deliberately. Endpoint
**execution** still requires a valid Bearer token and the appropriate permission —
only the schema is public.

## Out of scope
- Documenting the refresh-cookie flow as a security scheme.
- Hand-written `@ApiProperty` on every DTO / bespoke response schemas per endpoint.
- Gating or disabling the docs page (basic auth / production toggle).
- Frontend changes.
