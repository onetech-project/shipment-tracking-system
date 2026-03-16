<!--
  SYNC IMPACT REPORT
  ==================
  Version Change: 1.0.0 → 1.1.0
  Bump Type: MINOR (Section VI materially expanded: Playwright mandate added;
             automation testing made mandatory for every feature)

  Added Sections: None
  Removed Sections: None
  Modified Principles:
    VI. Testing Requirements — old: Unit + Integration only, tests declared mandatory
                             → new: Unit + Integration + E2E (Playwright) mandatory;
                               Playwright designated as primary automation tool;
                               all automation tests MUST pass before merging.

  Templates Requiring Updates:
    ✅ .specify/templates/plan-template.md  — Testing hint updated to include
                                              Playwright as primary E2E tool.
    ✅ .specify/templates/tasks-template.md — "Tests OPTIONAL" note updated;
                                              automation test tasks are now
                                              mandatory per constitution.
    ✅ .specify/templates/spec-template.md  — No structural change required;
                                              Independent Test descriptors already
                                              align with E2E verifiability.
    ✅ .github/prompts/*.prompt.md          — No CLAUDE-only or outdated agent
                                              references detected.

  Deferred TODOs: None
-->

# Shipment Tracking System Constitution

This constitution defines the **mandatory engineering principles** for the
Shipment Tracking System (STS). All contributors, automation tools, and
AI-assisted development MUST follow these rules.

Violating these principles requires explicit architectural justification
documented in the relevant plan's Complexity Tracking table.

---

## Core Principles

### I. Repository Architecture

The system MUST use a **Monorepo architecture**.

Required layout:

```
/apps
  /backend
  /frontend
/packages
  /shared
```

Rules:

- Backend and frontend MUST reside in the same repository.
- Shared logic MUST be placed inside `/packages/shared`.
- Code duplication across applications is NOT allowed.
- Each application MUST remain independently buildable and deployable.

Goals: consistent dependency management, shared types and utilities,
simplified CI/CD.

---

### II. Technology Stack

#### Backend

Backend MUST use NestJS, TypeScript, and PostgreSQL.

Required directory layout:

```
apps/backend/
  package.json
  Dockerfile
  src/
```

Backend MUST follow **modular architecture** using NestJS modules.

#### Frontend

Frontend MUST use Next.js and TypeScript.

Required directory layout:

```
apps/frontend/
  package.json
  Dockerfile
  src/
```

Frontend MUST support responsive design and mobile-first layout.

---

### III. Database

The primary database MUST be **PostgreSQL**.

Rules:

- All schema changes MUST be handled using migrations.
- Database schema MUST be version controlled.
- Every table MUST include `created_at` and `updated_at` columns.
- `created_by` and `updated_by` are recommended additional fields.
- Duplicated SQL logic MUST be avoided.
- Proper indexing MUST be implemented for frequently queried fields.
- N+1 query patterns MUST be avoided.

---

### IV. Core Engineering Principles

All code MUST follow DRY, KISS, and YAGNI.

**DRY — Don't Repeat Yourself**: Duplicate logic MUST be eliminated.
Shared code SHOULD be extracted to `/packages/shared`.

**KISS — Keep It Super Simple**: Prefer simple solutions over complex
abstractions. Deep inheritance trees, excessive indirection, and
unnecessary abstraction layers are indicators of over-engineering and
MUST be avoided.

**YAGNI — You Aren't Gonna Need It**: Only implement functionality that
is currently required. Speculative features, premature optimization, and
unused abstraction layers are NOT allowed.

---

### V. Modular Architecture

The system MUST follow **Feature-Based Modular Architecture**.

Backend structure:

```
src/
  modules/
    shipment/
    tracking/
    courier/
  common/
```

Rules:

- Each feature MUST be isolated.
- Cross-module communication MUST use explicit interfaces.
- Shared utilities MUST live in `common/`.

Frontend structure:

```
src/
  features/
    shipment/
    tracking/
  components/
  shared/
```

Rules:

- Business logic belongs inside `features/`.
- Shared UI elements MUST remain generic.
- Feature coupling MUST be avoided.

---

### VI. Testing Requirements

Testing is mandatory. Every feature MUST include automated tests covering
unit, integration, and end-to-end (E2E) scenarios.

Required test types:

- **Unit Tests** — test individual functions and service methods in isolation.
- **Integration Tests** — test module interactions, database operations, and
  API endpoints.
- **E2E / Automation Tests** — test full user journeys through the system UI
  using **Playwright** as the primary automation testing tool.

Rules:

1. Every feature MUST include unit, integration, and Playwright E2E tests.
2. **All automation tests (unit, integration, and E2E) MUST pass before a
   feature is considered complete or merged.**
3. CI MUST fail when any test — including Playwright E2E tests — fails.
4. Playwright tests MUST cover the critical user flows defined in the
   feature's user stories.
5. Playwright tests MUST be co-located with the feature or placed under
   `apps/frontend/e2e/` and organized by feature.

Tests MUST be deterministic, isolated, and reproducible.

Playwright-specific requirements:

- Page Object Model (POM) pattern SHOULD be used for maintainability.
- Tests MUST NOT rely on hardcoded wait times (`page.waitForTimeout`);
  use auto-waiting assertions instead.
- Test fixtures MUST clean up database state to avoid cross-test pollution.
- Headless mode MUST be used in CI; headed mode is permitted locally.

---

### VII. Fail-Safe and Fault-Tolerant Design

The system MUST be resilient to failures.

**Fail-Safe**: Failures MUST NOT corrupt system state. Requirements
include proper error handling, structured logging, graceful error
responses. Critical failures MUST NOT crash the entire system.

**Fault Tolerance**: Temporary failures (network errors, external API
downtime, queue delays) MUST be tolerated using retry, timeout, and
fallback logic strategies.

---

### VIII. Retryable System

External operations MUST support retries.

Applies to: courier tracking APIs, webhook deliveries, and external
integrations.

Requirements:

- Exponential backoff MUST be applied.
- Retry attempts MUST be limited.
- Operations MUST be idempotent.

Default retry schedule: `1s → 3s → 10s → 30s`.

Operations MUST prevent duplicate processing.

---

### IX. Idempotency

Critical operations MUST be idempotent.

Applies to: webhook processing, payment callbacks, shipment status
updates.

Strategies:

- Idempotency keys
- Database uniqueness constraints
- Event deduplication

Duplicate requests MUST NOT produce duplicate effects.

---

### X. Observability

The system MUST provide full observability through logging, metrics,
and tracing.

**Logging**: All services MUST provide structured logs containing
`timestamp`, `request_id`, `service_name`, and `error_context`.

**Metrics**: System MUST expose metrics for request latency, error
rates, retry counts, and queue processing time.

**Tracing**: Distributed tracing SHOULD be implemented for
cross-service requests.

---

### XI. Rate Limiting

APIs MUST protect themselves from abuse using rate limiting, request
throttling, and burst protection.

Goals: prevent denial of service and protect infrastructure resources.

---

### XII. Event-Driven Readiness

The system SHOULD be designed to support event-driven workflows.

Core domain events include:

- `shipment_created`
- `shipment_updated`
- `tracking_updated`
- `delivery_completed`

Event-driven design enables async processing, decoupled services, and
scalable workflows.

---

### XIII. Cost Efficiency

Infrastructure MUST be cost efficient.

Avoid: unnecessary microservices, expensive managed services without
justification, over-provisioned infrastructure.

Preferred approaches: stateless services, horizontal scaling, efficient
database usage.

Goal: deliver **high reliability with minimal operational cost**.

---

### XIV. CI/CD and Automation

Each application MUST include a `Dockerfile` and a `Jenkinsfile`.

CI pipeline MUST run in this order:

1. Dependency installation
2. Lint
3. Tests
4. Build
5. Docker build

Deployment MUST be blocked if tests fail.

---

### XV. Security Baseline

Security MUST be considered from the start.

Minimum requirements:

- Input validation
- Output sanitization
- Secure environment variables
- No secrets inside the repository

APIs MUST validate request schema, authentication, and authorization.

---

### XVI. Documentation

Every major module MUST include documentation.

Required documentation:

- README
- API specification
- Environment setup instructions

Code SHOULD be self-explanatory whenever possible.

---

### XVII. Core Feature Reliability: OCR and QR Scanner

OCR and QR scanning are the **primary entry points of shipment data**
and MUST be treated as **critical infrastructure components** designed
with reliability, accuracy, fault tolerance, observability, and
retryability.

#### 17.1 OCR Processing (PDF Data Extraction)

The system MUST support OCR processing to extract structured data from
PDF documents.

Requirements:

- OCR MUST reliably extract shipment-related data fields.
- OCR pipelines MUST support PDF parsing, text extraction, and
  structured data mapping.
- OCR processes MUST tolerate document format variations.
- OCR processing MUST be separated from request-response APIs where
  possible.
- OCR SHOULD support asynchronous processing for large documents.
- OCR errors MUST NOT crash the processing pipeline.

Failure handling:

- Failed OCR jobs MUST be retryable.
- Partial extraction MUST be logged for debugging.
- The system SHOULD provide fallback mechanisms when OCR confidence
  is low.

#### 17.2 QR Code Scanning

QR codes embedded in shipment labels MUST be reliably detected and
decoded.

Requirements:

- QR scanning MUST support camera-based scanning, image-based
  decoding, and PDF-embedded QR detection.
- QR decoding MUST return a valid shipment identifier or tracking
  reference.

Failure handling:

- Failed scans MUST return clear error messages.
- Scanning MUST support retries without duplicating shipment records.

#### 17.3 Data Validation

Data extracted from OCR or QR MUST be validated before entering the
system.

Validation rules MAY include: tracking number format, courier
identification, and shipment date validation.

Invalid data MUST NOT enter the system without verification.

#### 17.4 Idempotent Processing

OCR and QR scan results MUST be processed idempotently.

The following scenarios MUST NOT create duplicate shipments or
duplicate tracking records:

- Same document uploaded twice
- Same QR scanned multiple times
- Duplicate webhook delivery

#### 17.5 Retry and Recovery

OCR and QR pipelines MUST support automatic retries.

Retry conditions: temporary OCR processing failure, corrupted document
read, QR decoding error.

Retry schedule: `1s → 3s → 10s → 30s`.

Failures MUST be logged with full diagnostic information.

#### 17.6 Accuracy Monitoring

The system SHOULD track accuracy metrics for OCR and QR detection.

Required metrics:

- OCR success rate
- QR scan success rate
- Failed document processing rate
- Average processing latency

These metrics MUST be observable through system monitoring.

#### 17.7 Performance Expectations

- QR scan decoding SHOULD occur within milliseconds.
- OCR document processing SHOULD complete within acceptable processing
  windows.
- Large documents MAY be processed asynchronously to prevent blocking
  API responses.

---

## Governance

This constitution supersedes all other practices and guidelines within
the project. Any deviation requires explicit justification documented
in the plan's Complexity Tracking table.

Amendment procedure:

1. Propose the change with rationale in a pull request.
2. Obtain review and approval from at least one other contributor.
3. Update `LAST_AMENDED_DATE` and increment `CONSTITUTION_VERSION`
   according to semantic versioning:
   - **MAJOR**: Backward-incompatible governance/principle removals or
     redefinitions.
   - **MINOR**: New principle or section added or materially expanded.
   - **PATCH**: Clarifications, wording fixes, non-semantic refinements.
4. Propagate changes to all dependent templates as listed in the Sync
   Impact Report.

All PRs and code reviews MUST verify compliance with these principles.
Complexity MUST be justified; simplicity is the default.

Compliance review SHOULD be performed at the start of each plan cycle
via the `Constitution Check` gate in `plan-template.md`.

**Version**: 1.1.0 | **Ratified**: 2026-03-14 | **Last Amended**: 2026-03-16
