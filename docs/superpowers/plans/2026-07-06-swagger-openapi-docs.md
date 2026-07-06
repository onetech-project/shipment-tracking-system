# Swagger / OpenAPI Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive Swagger UI to the NestJS backend that faithfully mirrors the existing public/private auth split — private endpoints require a Bearer token (lock icon), public endpoints stay open — driven by the app's existing `@Public()` / `@Authorize()` metadata with zero per-endpoint drift.

**Architecture:** Enable the `@nestjs/swagger` CLI plugin to auto-generate DTO schemas from existing TypeScript + `class-validator` decorators. A single isolated helper (`setupSwagger`) builds the OpenAPI document, sets a document-level default Bearer requirement, then reconciles each operation against the *existing* route metadata (read via `DiscoveryService`): public routes get `security: []`, `@Authorize` routes get their required permission appended to the description. UI is served fully public at `/api/docs`.

**Tech Stack:** NestJS 10, `@nestjs/swagger@7.4.2`, TypeScript, Jest, pnpm (monorepo — backend is the `backend` workspace).

## Global Constraints

- Package manager is **pnpm**; backend commands run from `apps/backend` or via `pnpm --filter backend <script>`. (See [[pkg-manager-pnpm-xlsx]].)
- Do **not** modify any guard, decorator behavior, or route protection. This feature only *reads* existing auth metadata.
- The `@Public()` metadata key is `IS_PUBLIC_KEY` from `src/common/decorators/public.decorator.ts`; the `@Authorize` permission key is `PERMISSION_KEY` from `src/common/decorators/authorize.decorator.ts`.
- Access token is a **Bearer JWT** (`Authorization: Bearer <token>`); the security scheme name is `access-token`.
- Global route prefix is `api` (set in `main.ts` via `setGlobalPrefix('api')`).
- Build uses a custom webpack config (`webpack.config.js`) that spreads `...options`, so the Nest-injected swagger plugin transformer is preserved — no webpack changes required.
- New `@nestjs/swagger` version must be `7.x` (NestJS 10 compatibility). Exact target: `7.4.2`.

---

### Task 1: Install `@nestjs/swagger` and enable the CLI plugin

**Files:**
- Modify: `apps/backend/package.json` (dependencies — via pnpm, do not hand-edit)
- Modify: `apps/backend/nest-cli.json`

**Interfaces:**
- Produces: the `@nestjs/swagger` package (`DocumentBuilder`, `SwaggerModule`, `OpenAPIObject`, `ApiTags`, `ApiProperty`) available to import; DTO property schemas auto-generated at build time by the plugin.

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm add @nestjs/swagger@7.4.2
```
Expected: installs `@nestjs/swagger` and its peer `swagger-ui-express`; `package.json` gains `"@nestjs/swagger": "7.4.2"` under dependencies.

- [ ] **Step 2: Enable the swagger plugin in `nest-cli.json`**

Replace the `compilerOptions` block in `apps/backend/nest-cli.json` so the plugin is added while keeping the existing webpack settings:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "webpackConfigPath": "webpack.config.js",
    "plugins": [
      { "name": "@nestjs/swagger", "options": { "classValidatorShim": true, "introspectComments": false } }
    ]
  }
}
```

- [ ] **Step 3: Verify the build still succeeds with the plugin wired in**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm build
```
Expected: build completes with no errors and `dist/main.js` is produced. (This proves the plugin transformer coexists with the custom webpack config.)

- [ ] **Step 4: Commit**

```bash
cd /home/faris/code/sts/shipment-tracking-system
git add apps/backend/package.json apps/backend/nest-cli.json pnpm-lock.yaml
git commit -m "chore(backend): add @nestjs/swagger and enable its CLI plugin"
```

---

### Task 2: Pure post-processor that reconciles operations with auth metadata

This is the testable core. A pure function that mutates an OpenAPI document given a map of auth info — no Nest runtime needed, so it is unit-tested directly.

**Files:**
- Create: `apps/backend/src/common/swagger/apply-auth-metadata.ts`
- Test: `apps/backend/src/common/swagger/apply-auth-metadata.spec.ts`

**Interfaces:**
- Produces:
  - `interface RouteAuthInfo { isPublic: boolean; permission?: string }`
  - `type AuthMap = Map<string, RouteAuthInfo>` — keyed by `` `${ControllerName}.${methodName}` `` (matches the operationId factory in Task 4).
  - `function applyAuthMetadata(document: OpenAPIObject, authMap: AuthMap): void` — mutates the document in place.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/swagger/apply-auth-metadata.spec.ts`:

```ts
import { OpenAPIObject } from '@nestjs/swagger'
import { applyAuthMetadata, AuthMap } from './apply-auth-metadata'

function makeDoc(): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/auth/login': {
        post: { operationId: 'AuthController.login', security: [{ 'access-token': [] }] },
      },
      '/users': {
        get: {
          operationId: 'UsersController.findAll',
          security: [{ 'access-token': [] }],
          description: 'List users',
        },
      },
      '/audit': {
        get: { operationId: 'AuditController.list', security: [{ 'access-token': [] }] },
      },
    },
  } as unknown as OpenAPIObject
}

describe('applyAuthMetadata', () => {
  it('clears security for public operations', () => {
    const doc = makeDoc()
    const map: AuthMap = new Map([['AuthController.login', { isPublic: true }]])
    applyAuthMetadata(doc, map)
    expect((doc.paths['/auth/login'] as any).post.security).toEqual([])
  })

  it('appends the required permission to the description and keeps security', () => {
    const doc = makeDoc()
    const map: AuthMap = new Map([
      ['UsersController.findAll', { isPublic: false, permission: 'read.user' }],
    ])
    applyAuthMetadata(doc, map)
    const op = (doc.paths['/users'] as any).get
    expect(op.security).toEqual([{ 'access-token': [] }])
    expect(op.description).toContain('read.user')
    expect(op.description).toContain('List users')
  })

  it('leaves operations that are not in the map untouched', () => {
    const doc = makeDoc()
    applyAuthMetadata(doc, new Map())
    expect((doc.paths['/audit'] as any).get.security).toEqual([{ 'access-token': [] }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm test -- apply-auth-metadata
```
Expected: FAIL — `Cannot find module './apply-auth-metadata'`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/common/swagger/apply-auth-metadata.ts`:

```ts
import { OpenAPIObject } from '@nestjs/swagger'

export interface RouteAuthInfo {
  isPublic: boolean
  permission?: string
}

/** Keyed by `${ControllerName}.${methodName}`, matching the operationId factory. */
export type AuthMap = Map<string, RouteAuthInfo>

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const

/**
 * Mutates the OpenAPI document so each operation reflects the app's existing
 * auth model:
 *   - public routes get `security: []` (no bearer lock, no token needed)
 *   - `@Authorize` routes get the required permission appended to the description
 * Operations whose operationId is absent from `authMap` are left untouched, so
 * they keep the document-level default security requirement.
 */
export function applyAuthMetadata(document: OpenAPIObject, authMap: AuthMap): void {
  const paths = document.paths ?? {}
  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey] as Record<string, any>
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation || typeof operation !== 'object') continue
      const opId: string | undefined = operation.operationId
      if (!opId) continue
      const info = authMap.get(opId)
      if (!info) continue

      if (info.isPublic) {
        operation.security = []
      }
      if (info.permission) {
        const note = `**Requires permission:** \`${info.permission}\``
        operation.description = operation.description
          ? `${operation.description}\n\n${note}`
          : note
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm test -- apply-auth-metadata
```
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/sts/shipment-tracking-system
git add apps/backend/src/common/swagger/apply-auth-metadata.ts apps/backend/src/common/swagger/apply-auth-metadata.spec.ts
git commit -m "feat(backend): add pure OpenAPI auth-metadata post-processor"
```

---

### Task 3: Build the auth map from existing route metadata (discovery glue)

Reads `@Public()` / `@Authorize()` metadata off every controller handler and produces the `AuthMap` consumed by Task 2.

**Files:**
- Create: `apps/backend/src/common/swagger/build-auth-map.ts`
- Test: `apps/backend/src/common/swagger/build-auth-map.spec.ts`

**Interfaces:**
- Consumes: `AuthMap`, `RouteAuthInfo` (Task 2); `IS_PUBLIC_KEY` (`../decorators/public.decorator`); `PERMISSION_KEY` (`../decorators/authorize.decorator`); `DiscoveryService`, `MetadataScanner` (`@nestjs/core`).
- Produces: `function buildAuthMap(discovery: DiscoveryService, scanner: MetadataScanner): AuthMap`.

- [ ] **Step 1: Write the failing test**

The function depends only on the small surface `getControllers()` (DiscoveryService) and `getAllMethodNames()` (MetadataScanner), so we stub both. We attach real metadata with `Reflect.defineMetadata` using the actual keys, exactly as `@Public()`/`@Authorize()` do.

Create `apps/backend/src/common/swagger/build-auth-map.spec.ts`:

```ts
import 'reflect-metadata'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY } from '../decorators/authorize.decorator'
import { buildAuthMap } from './build-auth-map'

class FakeController {
  publicRoute() {}
  privateRoute() {}
  authorizedRoute() {}
}

// Emulate @Public() on publicRoute and @Authorize(read.user) on authorizedRoute
Reflect.defineMetadata(IS_PUBLIC_KEY, true, FakeController.prototype.publicRoute)
Reflect.defineMetadata(PERMISSION_KEY, 'read.user', FakeController.prototype.authorizedRoute)

function makeStubs() {
  const instance = new FakeController()
  const discovery = {
    getControllers: () => [{ instance, metatype: FakeController }],
  } as unknown as DiscoveryService
  const scanner = new MetadataScanner()
  return { discovery, scanner }
}

describe('buildAuthMap', () => {
  it('marks @Public() handlers as public', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.publicRoute')).toEqual({ isPublic: true, permission: undefined })
  })

  it('captures the @Authorize permission and keeps the route private', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.authorizedRoute')).toEqual({
      isPublic: false,
      permission: 'read.user',
    })
  })

  it('marks handlers with no auth metadata as private with no permission', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.privateRoute')).toEqual({
      isPublic: false,
      permission: undefined,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm test -- build-auth-map
```
Expected: FAIL — `Cannot find module './build-auth-map'`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/common/swagger/build-auth-map.ts`:

```ts
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY } from '../decorators/authorize.decorator'
import { AuthMap } from './apply-auth-metadata'

/**
 * Walks every registered controller and reads the same auth metadata the guards
 * consume (`@Public()` and `@Authorize()`), producing a map keyed by
 * `${ControllerName}.${methodName}` — matching the Swagger operationId factory.
 * Method-level `@Public()` wins; a class-level `@Public()` marks all handlers.
 */
export function buildAuthMap(discovery: DiscoveryService, scanner: MetadataScanner): AuthMap {
  const map: AuthMap = new Map()

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper
    if (!instance || !metatype) continue

    const controllerName = metatype.name
    const prototype = Object.getPrototypeOf(instance)
    const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName]
      if (typeof handler !== 'function') continue

      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classIsPublic
      const permission: string | undefined = Reflect.getMetadata(PERMISSION_KEY, handler)

      map.set(`${controllerName}.${methodName}`, { isPublic, permission })
    }
  }

  return map
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm test -- build-auth-map
```
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/sts/shipment-tracking-system
git add apps/backend/src/common/swagger/build-auth-map.ts apps/backend/src/common/swagger/build-auth-map.spec.ts
git commit -m "feat(backend): build Swagger auth map from @Public/@Authorize metadata"
```

---

### Task 4: Wire up `setupSwagger` and mount it in `main.ts`

Assembles the document, sets the default Bearer requirement, applies the post-processor, and serves the UI. Also imports `DiscoveryModule` so `DiscoveryService` resolves.

**Files:**
- Create: `apps/backend/src/common/swagger/setup-swagger.ts`
- Modify: `apps/backend/src/app.module.ts` (add `DiscoveryModule` to imports)
- Modify: `apps/backend/src/main.ts` (call `setupSwagger(app)`)

**Interfaces:**
- Consumes: `buildAuthMap` (Task 3), `applyAuthMetadata` (Task 2), `DiscoveryService`/`MetadataScanner` (`@nestjs/core`), `DocumentBuilder`/`SwaggerModule` (`@nestjs/swagger`).
- Produces: `function setupSwagger(app: INestApplication): void`; UI at `/api/docs`, spec JSON at `/api/docs-json`.

- [ ] **Step 1: Create `setup-swagger.ts`**

Create `apps/backend/src/common/swagger/setup-swagger.ts`:

```ts
import { INestApplication } from '@nestjs/common'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { applyAuthMetadata } from './apply-auth-metadata'
import { buildAuthMap } from './build-auth-map'

/**
 * Mounts Swagger UI at /api/docs. Every operation defaults to requiring the
 * `access-token` Bearer scheme; the post-processor then clears security on
 * `@Public()` routes and documents the required permission on `@Authorize()`
 * routes — all driven by the app's existing metadata.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Shipment Tracking System API')
    .setDescription(
      'REST API for the Shipment Tracking System. Private endpoints require a ' +
        'Bearer access token — obtain one via POST /api/auth/login, then click ' +
        'Authorize and paste the accessToken.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addServer('/api')
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}.${methodKey}`,
  })

  // Default: every operation requires the bearer token…
  document.security = [{ 'access-token': [] }]

  // …then reconcile against the app's real @Public()/@Authorize() metadata.
  const discovery = app.get(DiscoveryService)
  applyAuthMetadata(document, buildAuthMap(discovery, new MetadataScanner()))

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  })
}
```

- [ ] **Step 2: Import `DiscoveryModule` in `app.module.ts`**

In `apps/backend/src/app.module.ts`, add `DiscoveryModule` to the existing `@nestjs/core` import and to the `imports` array.

Change the import line (which currently imports `APP_FILTER, APP_GUARD, APP_INTERCEPTOR`):

```ts
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core'
```

Then add `DiscoveryModule` as the first entry in the `imports: [ ... ]` array (before `ConfigModule.forRoot(...)`):

```ts
  imports: [
    DiscoveryModule,
    ConfigModule.forRoot({
```

- [ ] **Step 3: Call `setupSwagger(app)` in `main.ts`**

In `apps/backend/src/main.ts`, add the import near the other imports:

```ts
import { setupSwagger } from './common/swagger/setup-swagger'
```

Then call it after `app.setGlobalPrefix('api')` and before the `port`/`app.listen` lines:

```ts
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  setupSwagger(app)

  const port = process.env.BACKEND_PORT ?? 4000
```

- [ ] **Step 4: Verify the app boots and the full test suite passes**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm build && pnpm test
```
Expected: build succeeds; all tests (including the two new specs) pass.

- [ ] **Step 5: Runtime smoke check — docs served + public/private reflected + path prefix**

Start the backend in dev (requires the project's normal env: DB/Redis via the usual dev setup) and probe the generated spec:

```bash
cd /home/faris/code/sts/shipment-tracking-system
pnpm dev:backend
```
In a second terminal:
```bash
# UI is reachable
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/docs        # expect 200
# spec JSON is reachable
curl -s http://localhost:4000/api/docs-json > /tmp/openapi.json
# login is public (security must be an empty array)
node -e "const d=require('/tmp/openapi.json');const p=d.paths;const hit=Object.entries(p).find(([k])=>k.endsWith('/auth/login'));console.log('loginPathKey=',hit[0]);console.log('loginSecurity=',JSON.stringify(hit[1].post.security))"
# a private route keeps the bearer requirement and documents its permission
node -e "const d=require('/tmp/openapi.json');const p=d.paths;const hit=Object.entries(p).find(([k])=>k.endsWith('/users')&&p[k].get);const op=hit[1].get;console.log('usersSecurity=',JSON.stringify(op.security));console.log('usersDesc=',op.description)"
```
Expected:
- `/api/docs` → `200`.
- `loginSecurity=[]` (public, no lock).
- `usersSecurity=[{"access-token":[]}]` and `usersDesc` contains `Requires permission: \`read.user\``.

**Path-prefix decision (do this once, here):** look at `loginPathKey` printed above.
- If it is `/auth/login` (no `/api`), the `.addServer('/api')` in `setup-swagger.ts` is correct — leave it. "Try it out" will target `/api/auth/login`.
- If it is already `/api/auth/login`, Nest is prepending the prefix; **remove** the `.addServer('/api')` line from `setup-swagger.ts` to avoid a doubled `/api/api/...`, then re-run this step.

Confirm in the browser: open `http://localhost:4000/api/docs`, click **Authorize**, paste an `accessToken` obtained from `POST /api/auth/login`, and execute a private endpoint (e.g. `GET /api/users`) to confirm it returns 200 with the token and 401 without.

- [ ] **Step 6: Commit**

```bash
cd /home/faris/code/sts/shipment-tracking-system
git add apps/backend/src/common/swagger/setup-swagger.ts apps/backend/src/app.module.ts apps/backend/src/main.ts
git commit -m "feat(backend): serve Swagger UI at /api/docs reflecting public/private auth"
```

---

### Task 5: Group endpoints with `@ApiTags` and document the login response

Light, mechanical polish so the UI groups cleanly and the auth flow is self-explanatory. No logic changes.

**Files:**
- Modify (add one `@ApiTags(...)` decorator + import each): all 12 controllers listed below.
- Create: `apps/backend/src/modules/auth/dto/login-response.dto.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts` (annotate the `login` return type)

**Interfaces:**
- Consumes: `ApiTags`, `ApiProperty` (`@nestjs/swagger`).
- Produces: `class LoginResponseDto { accessToken: string; user: AuthenticatedUser }` used as the `login` handler's documented return type.

- [ ] **Step 1: Add `@ApiTags` to every controller**

For each controller file below, add `import { ApiTags } from '@nestjs/swagger'` and place the matching `@ApiTags('<tag>')` decorator directly above the existing `@Controller(...)` line:

| File | Tag |
| --- | --- |
| `src/app.controller.ts` | `Health` |
| `src/modules/auth/auth.controller.ts` | `Auth` |
| `src/modules/air-shipments/air-shipments.controller.ts` | `Air Shipments` |
| `src/modules/audit/audit.controller.ts` | `Audit` |
| `src/modules/general-params/general-params.controller.ts` | `General Params` |
| `src/modules/invitations/invitations.controller.ts` | `Invitations` |
| `src/modules/organizations/organizations.controller.ts` | `Organizations` |
| `src/modules/permissions/permissions.controller.ts` | `Permissions` |
| `src/modules/pnl/pnl.controller.ts` | `PnL` |
| `src/modules/pnl-settlement/pnl-settlement.controller.ts` | `PnL Settlement` |
| `src/modules/roles/roles.controller.ts` | `Roles` |
| `src/modules/users/users.controller.ts` | `Users` |

Example (for `auth.controller.ts`):

```ts
import { ApiTags } from '@nestjs/swagger'
// ...existing imports...

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
```

- [ ] **Step 2: Create the login response DTO**

Create `apps/backend/src/modules/auth/dto/login-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator'

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token. Send as `Authorization: Bearer <token>` on private endpoints.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string

  @ApiProperty({ description: 'The authenticated user profile and permissions.' })
  user: AuthenticatedUser
}
```

- [ ] **Step 3: Annotate the `login` handler return type**

In `apps/backend/src/modules/auth/auth.controller.ts`, import the DTO and give `login` an explicit `Promise<LoginResponseDto>` return type so the plugin documents the response body. (The runtime return value is unchanged.)

Add the import:
```ts
import { LoginResponseDto } from './dto/login-response.dto'
```
Change the `login` method signature from `async login(` returning implicitly to:
```ts
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponseDto> {
```

- [ ] **Step 4: Verify build + existing auth tests still pass**

Run:
```bash
cd /home/faris/code/sts/shipment-tracking-system/apps/backend
pnpm build && pnpm test -- auth.controller
```
Expected: build succeeds; existing `auth.controller.spec.ts` passes unchanged.

- [ ] **Step 5: Runtime check — tags group the UI and login shows a response schema**

With the backend running (`pnpm dev:backend`), open `http://localhost:4000/api/docs` and confirm operations are grouped under the tags above and that `POST /api/auth/login` shows a `200` response schema with `accessToken` and `user`.

- [ ] **Step 6: Commit**

```bash
cd /home/faris/code/sts/shipment-tracking-system
git add apps/backend/src
git commit -m "docs(backend): tag Swagger controllers and document login response"
```

---

## Self-Review

**1. Spec coverage:**
- Dependency `@nestjs/swagger` + plugin → Task 1. ✅
- Isolated `setupSwagger` helper (builder, default bearer, post-process, setup at `/api/docs`) → Task 4. ✅
- Post-processor clears security on public, appends permission on `@Authorize` → Task 2 (pure) + Task 3 (metadata source). ✅
- Reads existing `IS_PUBLIC_KEY` / `PERMISSION_KEY` via `DiscoveryService` → Task 3. ✅
- `main.ts` call after `setGlobalPrefix('api')`; global-prefix path correctness verified → Task 4 Step 5 (with the explicit `addServer` decision). ✅
- Fully public UI, no gating → Task 4 (no auth guard on setup). ✅
- Light `@ApiTags` on 12 controllers + optional `LoginResponseDto` → Task 5. ✅
- Auto DTO schemas via plugin (no per-field `@ApiProperty`) → Task 1 plugin. ✅
- Unit test for post-processor; smoke for JSON/UI → Task 2 + Task 4 Step 5. ✅
- Accepted trade-off (public schema) — documented in spec; no code gate needed. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps — every code step shows complete code; every run step shows exact command + expected output. The one runtime branch (Task 4 Step 5, `addServer`) has both outcomes spelled out concretely. ✅

**3. Type consistency:** `RouteAuthInfo`/`AuthMap` defined in Task 2 and consumed unchanged in Task 3; `buildAuthMap(discovery, scanner)` signature matches its call in Task 4; operationId factory `` `${controllerKey}.${methodKey}` `` matches the `AuthMap` key format `` `${ControllerName}.${methodName}` `` (controllerKey is the class name). `applyAuthMetadata(document, authMap)` signature consistent across Tasks 2 and 4. ✅
