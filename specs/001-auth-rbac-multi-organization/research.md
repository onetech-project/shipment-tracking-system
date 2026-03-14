# Phase 0 Research: Authentication & Authorization System

**Branch**: `001-auth-rbac-multi-organization` | **Date**: 2026-03-14  
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

---

## Topic A — Multi-Tenant Data Isolation Patterns

### A1 — Tenancy Model: Row-Level vs Schema-Per-Tenant

| | |
|---|---|
| **Decision** | Row-level tenancy: `organization_id UUID NOT NULL` column on every tenant-scoped table |
| **Rationale** | TypeORM has no native schema-switching support. Schema-per-tenant requires either a dedicated connection pool per tenant (memory explosion at 1000+ orgs) or setting `search_path` on every connection checkout — a fragile, error-prone manual step. Migrations become exponentially harder: every `TypeORM` migration must be replayed across all tenant schemas and kept in sync. Row-level tenancy works naturally with TypeORM's entity/repository model; all queries simply add `WHERE organization_id = ?`. For the target scale of ~10–1000 users/org with a single Postgres instance, row-level tenancy is operationally straightforward and performs well. A partial index on `organization_id` per table is sufficient to avoid table scans. |
| **Alternatives Considered** | **Schema-per-tenant**: Better blast-radius isolation (a bug can't leak data across schemas), but maintenance cost is prohibitive with TypeORM. Only justified if hard compliance requirements (GDPR data residency per tenant) exist — they don't here. **Database-per-tenant**: Complete isolation; requires provisioning a Postgres instance per org — operationally impractical for a single-app deployment. |

**Supporting implementation note**: Add a PostgreSQL partial unique index strategy: `CREATE UNIQUE INDEX uq_users_email_org ON users(email, organization_id)` — uniqueness is per-org, not global.

---

### A2 — Automatic `organization_id` Filtering in TypeORM

| | |
|---|---|
| **Decision** | `nestjs-cls` (AsyncLocalStorage) for request-scoped tenant context + a `TenantRepository<T>` abstract base class that reads from CLS and appends `organization_id` to every query automatically |
| **Rationale** | **TypeORM `@BeforeQuery` subscriber** is tempting but unreliable: the hook does not fire uniformly for `QueryBuilder` calls, raw queries, or eager-loaded relations. It produces invisible behaviour that is hard to test and debug. **Explicit `WHERE` clauses in every service method** are correct but require developer discipline on every query — a single forgotten clause causes a data leak. The CLS + TenantRepository pattern is the best balance: it is explicit (the base class is readable and testable), automatic (developers extending `TenantRepository` get it for free), and auditable (the `orgId` getter throws `UnauthorizedException` if called without a tenant context, failing loudly). |
| **Alternatives Considered** | **TypeORM Subscriber `@BeforeQuery`**: Unreliable for `QueryBuilder`, not recommended. **Explicit per-method filtering**: Correct but fragile under scale; prone to omission. **PostgreSQL Row-Level Security (RLS)**: Powerful defense-in-depth layer (the DB refuses queries without the right session variable), but requires setting `SET app.current_org = ?` on every connection checkout — complex to integrate with TypeORM's connection pool. Could be added as an extra layer later if security posture demands it. |

**Pattern**:

```typescript
// common/cls/tenant.cls.interceptor.ts
@Injectable()
export class TenantClsInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const user = context.switchToHttp().getRequest().user; // set by JwtAuthGuard
    this.cls.set('organizationId', user?.organizationId ?? null);
    return next.handle();
  }
}

// common/repositories/tenant.repository.ts
export abstract class TenantRepository<T extends { organizationId: string }> {
  constructor(
    protected readonly repo: Repository<T>,
    protected readonly cls: ClsService,
  ) {}

  protected get orgId(): string {
    const id = this.cls.get<string>('organizationId');
    if (!id) throw new UnauthorizedException('No tenant context on request');
    return id;
  }

  findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: { ...(options?.where ?? {}), organizationId: this.orgId } as FindOptionsWhere<T>,
    });
  }

  findById(id: string): Promise<T | null> {
    return this.repo.findOne({
      where: { id, organizationId: this.orgId } as FindOptionsWhere<T>,
    });
  }
}
```

---

### A3 — Preventing Cross-Org Data Leaks

| | |
|---|---|
| **Decision** | `organizationId` is read **exclusively from the JWT payload** (set at login time), never from request body or query parameters. The `TenantClsInterceptor` propagates it forward; service layer never accepts `organizationId` as a user-controlled input. |
| **Rationale** | User-controlled `organizationId` in request bodies is the root cause of IDOR (Insecure Direct Object Reference) vulnerabilities. Anchoring the tenant context to the authenticated JWT payload — which is signed and tamper-evident — eliminates this entire class of cross-org leaks. Service method signatures deliberately omit `organizationId` parameters (they read from CLS), making it impossible to accidentally pass the wrong value. |
| **Alternatives Considered** | **Organization header (`X-Org-ID`)**: Used by some SaaS APIs when users belong to multiple orgs. Valid approach but requires the header to be validated against the JWT's allowed org list on every request — more surface area for bugs. JWT-anchored is simpler for this system's one-primary-org-per-user model. |

**Rule**: `SuperAdminService` methods are the **only** methods that accept an explicit `organizationId` parameter (since Super Admin operates across all orgs). All other service methods derive tenant context from CLS only.

```typescript
// JWT payload shape
interface JwtPayload {
  sub: string;           // userId
  organizationId: string | null;  // null only for Super Admin
  isSuperAdmin: boolean;
  roles: string[];
  iat: number;
  exp: number;
}
```

---

### A4 — TypeORM Custom Repository Pattern for Tenant Context

| | |
|---|---|
| **Decision** | Concrete repositories extend `TenantRepository<T>` and are provided as custom NestJS providers using `DataSource.getRepository()` wrapped in a factory provider — **not** the deprecated `@EntityRepository` decorator. |
| **Rationale** | TypeORM 0.3+ removed `@EntityRepository`. The correct pattern is a factory provider that calls `dataSource.getRepository(Entity)` and wraps it in the custom class. This integrates cleanly with NestJS DI, allows `ClsService` injection, and is fully testable by mocking both `Repository<T>` and `ClsService`. |
| **Alternatives Considered** | **`@EntityRepository` decorator**: Removed in TypeORM 0.3; do not use. **Repository inheritance via `extends Repository<T>`**: TypeORM supports this but the DataSource factory approach is preferred for NestJS DI and CLS injection. |

**Pattern**:

```typescript
// modules/users/users.repository.ts
@Injectable()
export class UsersRepository extends TenantRepository<User> {
  constructor(dataSource: DataSource, cls: ClsService) {
    super(dataSource.getRepository(User), cls);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email, organizationId: this.orgId } as FindOptionsWhere<User>,
    });
  }
}

// modules/users/users.module.ts
@Module({
  providers: [UsersRepository, UsersService],
  imports: [TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
```

---

## Topic B — Invitation Token System

### B1 — Token Generation: `crypto.randomBytes` vs Signed JWT

| | |
|---|---|
| **Decision** | `crypto.randomBytes(32).toString('hex')` — opaque random token (64-character hex string) |
| **Rationale** | Invitation tokens must be **revocable**: when an admin re-invites an address, or when an org is deactivated, all pending invitations should be invalidatable immediately. JWTs are self-verifying — revocation requires a blocklist or a DB lookup, negating the stateless advantage. Since invitation acceptance already requires a DB lookup (to find the invitation record and activate the user), using an opaque token costs nothing extra. 32 random bytes = 256 bits of entropy = computationally unguessable. JWTs also risk payload exposure if a developer logs or stores them without understanding the base64 content. |
| **Alternatives Considered** | **Signed JWT**: Stateless verification, carries expiry claim. Not recommended here because: (1) revocation still needs DB; (2) payload exposure risk; (3) adds JWT signing key dependency to the invitation flow. Suitable only if you want zero-DB verification of invitation validity before showing a landing page — a minor UX optimization not worth the trade-off. |

---

### B2 — Token Storage: Raw vs Hash

| | |
|---|---|
| **Decision** | Store **SHA-256 hash** of the token in the database (`token_hash CHAR(64) NOT NULL`) |
| **Rationale** | Raw storage is a security vulnerability: a database read (via SQL injection, backup leak, or insider threat) yields immediately usable tokens. bcrypt is the correct password hashing algorithm but is intentionally slow (for brute-force resistance against weak passwords). Invitation tokens are already 256-bit random values — brute-force is impossible regardless of hash speed, so bcrypt's slowness adds only latency cost (~100ms) with no security benefit. SHA-256 is fast, deterministic, and cryptographically sufficient for high-entropy secrets. At verification: `crypto.createHash('sha256').update(rawToken).digest('hex')` → compare with `token_hash`. |
| **Alternatives Considered** | **bcrypt**: Correct but wastes CPU (bcrypt cost factor 12 = ~250ms/hash) for no gain against a 256-bit random token. Use for passwords, not tokens. **Raw storage**: Never; single DB read exposes all pending invitations. **HMAC-SHA256 with server secret**: Adds a server-side secret key for an extra layer — viable but adds key management overhead without meaningful benefit over plain SHA-256 for this use case. |

---

### B3 — Single-Use Enforcement

| | |
|---|---|
| **Decision** | `used_at TIMESTAMP NULL` column + **atomic `UPDATE ... WHERE used_at IS NULL`** as the race-condition guard, with `UNIQUE(token_hash)` as duplicate-storage prevention |
| **Rationale** | Application-level `if (invitation.usedAt) throw` checks have a race condition: two concurrent requests can both pass the null check before either writes the `used_at` timestamp. The atomic update pattern resolves this: the `UPDATE` statement's `WHERE used_at IS NULL` predicate acts as an optimistic lock at the database level — PostgreSQL's row-level locking ensures only one concurrent transaction can update the row; the second gets `affected = 0` and receives an error. This requires no Redis, no pessimistic locking, and no distributed coordination. |
| **Alternatives Considered** | **`SELECT FOR UPDATE` pessimistic lock**: Works but holds a row lock for the duration of the transaction, reducing throughput under concurrent load. Overkill for invitation acceptance (not a high-frequency operation). **Redis `SET NX`**: Correct distributed lock approach but adds an infrastructure dependency for a simple problem solvable in Postgres. **DB-level `CHECK` constraint**: Can model `CHECK (used_at IS NULL OR status = 'used')` — useful defense-in-depth but the application's atomic update is the primary control. |

**Implementation**:

```typescript
// Atomic single-use enforcement in InvitationsService
const result = await this.dataSource
  .createQueryBuilder()
  .update(Invitation)
  .set({ usedAt: new Date(), status: InvitationStatus.USED })
  .where('id = :id AND used_at IS NULL AND expires_at > NOW()', { id: invitation.id })
  .execute();

if (result.affected === 0) {
  throw new ConflictException('Invitation has already been used or has expired');
}
```

---

### B4 — Link Expiry: DB `expires_at` vs JWT `exp` Claim

| | |
|---|---|
| **Decision** | Store `expires_at TIMESTAMP NOT NULL` in the DB row |
| **Rationale** | Since acceptance already performs a DB lookup, adding expiry to the same row is zero extra cost. DB-stored expiry gives administrators **runtime control**: support staff can extend an expiry or revoke an invitation without touching the token itself. This is impossible with JWT-embedded expiry (the token would need to be reissued). The check `WHERE expires_at > NOW() AND used_at IS NULL` is atomic and unambiguous. Default: **72 hours** from creation (per spec assumptions). |
| **Alternatives Considered** | **JWT `exp` claim**: Eliminates one DB column, but removes server-side revocation control. Only advantageous if you want zero-DB token validation — not applicable here. **Both (DB + JWT)**: Redundant safety net — only worthwhile if using JWTs for other reasons already. |

---

### B5 — Email Delivery: `nodemailer` Direct vs `@nestjs-modules/mailer`

| | |
|---|---|
| **Decision** | `@nestjs-modules/mailer` with Handlebars templates, backed by an SMTP transactional provider (SendGrid / AWS SES / Postmark) |
| **Rationale** | `@nestjs-modules/mailer` is a thin NestJS wrapper around nodemailer that adds: `ConfigModule`-compatible setup, template engine support (Handlebars → HTML emails without string concatenation), and `MailerService` injectable as a standard NestJS service. Raw nodemailer requires manual template rendering, manual service instantiation, and more boilerplate — nothing gained. For production: do **not** send via local SMTP or Gmail. Use a transactional relay (SES, SendGrid, Postmark). These services provide delivery tracking, bounce handling, and SPF/DKIM signing. `@nestjs-modules/mailer` supports all of them via standard SMTP transport config. For retry resilience (required by spec constitution rule VIII), wrap `MailerService.sendMail()` calls in a BullMQ job with exponential backoff — the mailer is the delivery layer; the queue is the retry layer. |
| **Alternatives Considered** | **Raw `nodemailer`**: More control, no template engine, more boilerplate. Suitable only if you explicitly want zero extra dependencies. **SendGrid/Postmark SDK directly**: Bypasses nodemailer entirely. Works but locks to a vendor; SMTP transport is more portable. |

**Package**: `@nestjs-modules/mailer` + `handlebars`  
**Template location**: `apps/backend/src/modules/invitations/templates/invitation.hbs`

---

### B6 — Invitation for Existing Email

| | |
|---|---|
| **Decision** | **Idempotent re-invite**: Return the existing pending invitation (not a new one) if one exists and is still valid. If expired or used, revoke the old record and create a new invitation. If user is already an active member, throw `ConflictException`. |
| **Rationale** | Creating a new invitation every time produces multiple valid tokens for the same email — a security risk (attacker who intercepts an old email can still use it). Erroring on duplicate invite is too strict: admins routinely click "Resend invite" without knowing whether a prior invite exists. Returning the existing token is the most secure behaviour: only one active token per `(organization_id, email)` at any time. When the existing token is expired or used, generating a new one is expected and correct; the old record is preserved for audit and marked `revoked`. |
| **Alternatives Considered** | **Always create new**: Multiple simultaneous valid tokens — security concern. **Always error**: Hostile UX; forces admins to manually cancel before reinviting. |

**Database constraint**: Partial unique index to enforce one pending invitation per org+email:

```sql
CREATE UNIQUE INDEX uq_invitations_org_email_pending
  ON invitations(organization_id, email)
  WHERE status = 'pending';
```

---

### B7 — Invitation Link URL Structure

| | |
|---|---|
| **Decision** | Two-endpoint design: `GET /invitations/verify?token=<hex>` (token validation, no auth) + `POST /invitations/accept` `{ token, password, firstName, lastName }` (token consumption + user activation) |
| **Rationale** | A single `POST /invitations/accept` endpoint forces the frontend to pass the token from the URL to a form submit without any pre-validation — the user fills in name and password, submits, and only then learns the token is expired. The two-step design allows the frontend landing page to call `GET /verify` first, get `{ email, organizationName, expiresAt }`, and either show the form (valid) or an error screen (expired/used) immediately on page load. This is standard practice (Slack, Linear, GitHub all pre-validate invitation tokens on page load). Token in URL query param (vs path param) is conventional for non-resource identifiers. After acceptance, the backend response includes a JWT access token so the user is logged in immediately. |
| **Alternatives Considered** | **Single `POST` with token in body**: Cleaner from a "tokens in URLs" perspective. Requires the frontend to hold the token in session/state between page load and form submit — adds complexity. **`/invitations/:token` path param**: Equivalent semantics; query param is preferred for non-identity values per REST conventions. **`POST` only, check inline**: Simpler implementation but poor UX (form submission failure for expired tokens). |

**Full invitation redemption flow**:

```
Email link → https://app.example.com/accept-invite?token=<64-char-hex>
                         │
              Frontend /accept-invite page loads
                         │
              GET /api/invitations/verify?token=<hex>
              ← 200 { email, organizationName, valid: true, expiresAt }
              ← 410 Gone / 409 Conflict (expired / already used)
                         │
              User fills in: firstName, lastName, password
                         │
              POST /api/invitations/accept
                   { token, firstName, lastName, password }
              ← 201 { accessToken, refreshToken, user }
```

**Security note**: Tokens in URLs may appear in server access logs and browser history. Single-use + 72h expiry significantly mitigates this risk. The `GET /verify` endpoint returns token metadata but does not consume the token — only `POST /accept` does.

---

## Topic C — JWT Authentication

### C1 — Passport JWT Strategy and Guard

| | |
|---|---|
| **Decision** | `@nestjs/passport` + `passport-jwt` with `ExtractJwt.fromAuthHeaderAsBearerToken()`. `JwtStrategy.validate()` returns a lightweight `AuthUser` `{ id, orgId, isSuperAdmin }` — no DB lookup per request. Global `APP_GUARD` using `JwtAuthGuard extends AuthGuard('jwt')` + `@Public()` opt-out decorator. |
| **Rationale** | `validate()` return value is what NestJS sets on `req.user`. Keeping it lightweight avoids a DB query on every authenticated request — the signed token is trusted for user identity. Global opt-out guard is safer than per-route opt-in (new routes protected by default). |
| **Alternatives Considered** | Manual `jwt.verify()` middleware — bypasses Passport guard/decorator ecosystem. Per-controller `@UseGuards()` — easy to leave endpoints unprotected. |

---

### C2 — Token Signing, Payload, and TTLs

| | |
|---|---|
| **Decision** | Two separate secrets: `JWT_ACCESS_SECRET` (HS256, `expiresIn: '15m'`) and `JWT_REFRESH_SECRET` (HS256, `expiresIn: '7d'`). Access token payload: `{ sub, iat, exp, iss, aud, org_id, is_super_admin }`. Roles and permissions **not** embedded. Access token stored in JS memory; refresh token in `HttpOnly; Secure; SameSite=Strict` cookie. |
| **Rationale** | Separate secrets prevent cross-contamination if one is compromised. Explicit `algorithm: ['HS256']` prevents algorithm-confusion attacks. Not embedding roles/permissions avoids stale RBAC — they are loaded fresh per request via a DB-backed guard with a request-scoped cache. 15min access + 7d refresh + HttpOnly cookie is the recommended client-storage strategy. |
| **Alternatives Considered** | RS256 — correct for multi-service architectures; complexity is unjustified for a single backend. Switch when microservices are introduced. Roles in payload — stale after permission changes; rejected. |

---

### C3 — Refresh Token Rotation, Storage, and Inactivity Timeout

| | |
|---|---|
| **Decision** | Full rotation: every `/auth/refresh` issues a new access token + new refresh token and atomically revokes the old one. **Reuse detection**: if a revoked token is presented, revoke the entire token family. Storage: PostgreSQL `refresh_tokens` table with `token_hash CHAR(64)` (SHA-256), `family_id`, `expires_at`, `last_used_at`, `revoked_at`. Inactivity: check `last_used_at < NOW() - INTERVAL '<timeout>'` on each refresh call (default 30 min). |
| **Rationale** | Rotation limits stolen refresh token window. Reuse detection is a breach signal. PostgreSQL satisfies this with no additional infrastructure (no Redis needed). Inactivity detection via `last_used_at`: the client silently refreshes every ~14 minutes; if inactive, no refresh fires, `last_used_at` goes stale, and the next refresh is rejected. |
| **Alternatives Considered** | Redis — faster reads but extra infra; unjustified at this scale. Non-rotating — stolen token usable until expiry. Pure TTL expiry — provides only absolute, not inactivity, timeout. |

---

## Topic D — RBAC Guard, Permissions, and Bootstrap

### D1 — Decorator, Guard, and Permission Loading

| | |
|---|---|
| **Decision** | `@RequirePermission()` via `SetMetadata`. `@Authorize()` bundles `SetMetadata` + `@UseGuards(JwtAuthGuard, RbacGuard)` via `applyDecorators`. `RbacGuard` uses `Reflector.getAllAndOverride` for method-level priority. Permission query: single JOIN across `user_roles → roles → role_permissions → permissions` filtered by `(userId, organizationId)`. Result cached in a `Set<Permission>` on the request object (request-scoped). Service-layer `PermissionAssertion` injectable for defense-in-depth. |
| **Rationale** | One DB query per request, O(1) `Set` lookups, zero cross-user stale data (request-scoped cache dies with request). `applyDecorators` reduces per-route boilerplate. Service-layer assertion catches internal call paths that bypass HTTP guards. |
| **Alternatives Considered** | CASL — overkill for flat string permissions; deferred. Middleware for guards — can't read route metadata. Redis permission cache — defer until load testing reveals bottleneck. |

### D2 — Super Admin Bypass and Default Roles Seeding

| | |
|---|---|
| **Decision** | `is_super_admin` boolean in JWT payload. In `RbacGuard`: if `user.isSuperAdmin === true`, bypass DB lookup and return `true`. `RbacSeederService` implementing `OnApplicationBootstrap` seeds default roles (`super_admin`, `admin`, `owner`, `manager`, `staff`) and all `<action>.<module>` permission combinations using `INSERT ... ON CONFLICT DO NOTHING`. |
| **Rationale** | Super Admin is a platform identity, not an org-scoped role. Bypassing the DB lookup is both correct and optimal. `OnApplicationBootstrap` runs after module init — idempotent seeding on every restart ensures consistency without drift. |
| **Alternatives Considered** | Giving Super Admin all permission DB rows — incorrect modelling, causes N+1. TypeORM migrations for seed data — awkward for data that evolves with code deploys. |

---

## Topic E — Account Security

### E1 — Password Hashing, Lockout, and Audit Timestamps

| | |
|---|---|
| **Decision** | bcrypt cost factor **12**. Failed login tracking: `failed_attempts INT` + `locked_at TIMESTAMPTZ` on `users` table. Hard lock at threshold (default: 5); requires admin unlock (spec requirement). Lock check inside `AuthService.validateCredentials()` (before password compare). Admin unlock: reset `failed_attempts = 0`, `is_locked = false`, optional `require_password_reset` flag. `last_login_at` / `last_logout_at` updated in `AuthService`, fire-and-forget. |
| **Rationale** | Cost 12 balances security (~250–400ms) and performance. Increments on `users` table avoid extra joins. Hard lock is spec-required and NIST SP 800-63B aligned. Lock check before password compare avoids timing side-channels on locked accounts. |
| **Alternatives Considered** | bcrypt 10 — too fast for production. Separate `login_attempts` table — overkill for basic lockout. Time-based auto-unlock — contradicts spec requirement of admin unlock. |

---

## Topic F — Audit Logging

### F1 — Table Design, Write Pattern, and Retention

| | |
|---|---|
| **Decision** | Single polymorphic table: `(id, user_id, action, entity_type, entity_id, metadata JSONB, ip_address, user_agent, created_at)`. Range-partitioned by month. `@nestjs/event-emitter` async listener; fire-and-forget (no `await`). Indexes: `(user_id, created_at DESC)` + `(entity_type, entity_id, created_at DESC)`. Retention: pg_cron scheduled partition detach + archive to cold storage (S3). Default hot retention: 90 days. |
| **Rationale** | Single table = unified user activity view, single retention policy, zero schema change for new entity types. JSONB absorbs entity-specific metadata. Event emitter decouples audit from business logic — audit failures don't affect the request. Fire-and-forget satisfies spec non-blocking requirement. Partitioning makes archival instant (detach partition vs slow bulk DELETE). |
| **Alternatives Considered** | Per-domain audit tables — better per-domain index efficiency but no unified history view. Interceptor for audit writes — lacks business context. Blocking writes — adds latency and creates failure coupling. |

---

## Summary Decision Table

| # | Topic | Decision |
|---|-------|----------|
| A1 | Tenancy model | Row-level (`organization_id` column) |
| A2 | Auto-filtering | `nestjs-cls` + `TenantRepository<T>` base class |
| A3 | Cross-org leak prevention | `organizationId` from JWT only, never from request body |
| A4 | TypeORM repo pattern | Abstract `TenantRepository<T>` + DataSource factory provider |
| B1 | Token generation | `crypto.randomBytes(32).toString('hex')` |
| B2 | Token storage | SHA-256 hash in `token_hash CHAR(64)` column |
| B3 | Single-use enforcement | Atomic `UPDATE WHERE used_at IS NULL` + `UNIQUE(token_hash)` |
| B4 | Link expiry | `expires_at` column in DB row (72h default) |
| B5 | Email delivery | `@nestjs-modules/mailer` + Handlebars + SMTP transactional relay + BullMQ retry |
| B6 | Duplicate invite | Idempotent: return existing pending, or revoke+recreate if expired/used |
| B7 | Link URL structure | Two-step: `GET /invitations/verify` + `POST /invitations/accept` |
| C1 | JWT Strategy + Guard | `fromAuthHeaderAsBearerToken`, lightweight validate, global `APP_GUARD` + `@Public()` |
| C2 | Token signing + payload | Two secrets (HS256), `sub`/`org_id`/`is_super_admin` only, 15m access / 7d refresh |
| C3 | Rotation + storage + inactivity | Full rotation + family reuse detection, PostgreSQL `refresh_tokens`, `last_used_at` check |
| D1 | RBAC guard + permissions | `@Authorize()`, single JOIN, request-scoped `Set<Permission>`, service-layer assertion |
| D2 | Super Admin + seeding | `is_super_admin` JWT bypass, `OnApplicationBootstrap` upsert seed |
| E1 | Account security | bcrypt 12, `failed_attempts` on `users`, hard lock, admin unlock, fire-and-forget timestamps |
| F1 | Audit logging | Single polymorphic table, `@nestjs/event-emitter` async, monthly partitions |
