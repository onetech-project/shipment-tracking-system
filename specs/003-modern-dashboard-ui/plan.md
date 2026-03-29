# Implementation Plan: Modern Responsive Dashboard UI Revamp

**Branch**: `003-modern-dashboard-ui` | **Date**: 2025-07-14 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/003-modern-dashboard-ui/spec.md`

## Summary

Revamp the entire `apps/frontend` rendering layer from raw inline-style JSX into a cohesive,
mobile-first design system built on **Tailwind CSS** and **shadcn/ui**. The backend and API
layer remain completely unchanged. The revamp introduces a responsive sidebar that collapses to a
Sheet drawer on mobile, extracts shared UI primitives (Button, Card, Badge, Dialog, DataTable,
FormField) consumed across all pages, and adds subtle animations/shadows on every interactive
element. The dashboard home is upgraded from plain text to a welcome card + quick-action grid.
All existing Playwright E2E tests must pass without modification after the revamp.

## Technical Context

**Language/Version**: TypeScript 5.5, Next.js 14 (App Router), React 18  
**Primary Dependencies**:
- **Existing**: `react-hook-form 7.53`, `zod 3.23`, `@tanstack/react-query 5.51`, `axios 1.7`, `clsx 2.1`, `jsqr 1.4`, `@playwright/test 1.44`
- **New (UI)**: `tailwindcss 4.x`, `shadcn/ui` (CLI-driven, installs: `class-variance-authority`, `tailwind-merge`, `lucide-react`, `@radix-ui/*` primitives)
- **No new runtime dependencies beyond the above two packages**

**Storage**: N/A — UI-only change; no database schema changes  
**Testing**: Playwright E2E (mandatory per constitution, already configured at `apps/frontend/e2e/`) — zero existing test regressions + new UI tests covering all 5 user stories  
**Target Platform**: Web browser — mobile-first from 375 px upward; desktop ≥ 1024 px permanent sidebar  
**Project Type**: Web application (frontend rendering layer only)  
**Performance Goals**: All CSS transitions ≤ 150 ms; hover/focus feedback visible within 200 ms (SC-002); 60 fps animations  
**Constraints**:
- No changes to `apps/backend/` or `packages/shared/` — UI rendering layer only
- All `data-testid` attributes MUST be preserved verbatim on revamped components
- No inline `style` props or external CSS files beyond Tailwind base + CSS custom-property file
- "prefer-reduced-motion" suppresses all non-essential transitions (Tailwind `motion-safe` / `motion-reduce` variants)
- Single-column mobile layout at 375 px — zero horizontal overflow on any page

**Scale/Scope**: ~20 source files revamped; 6 shared primitives extracted; 1 new layout shell; 13 existing Playwright specs preserved + 5 new UI-responsive test files added

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Monorepo architecture (`/apps`, `/packages`) | ✅ PASS | Changes confined to `apps/frontend/`; monorepo structure unchanged |
| II | Frontend — Next.js + TypeScript; responsive / mobile-first | ✅ PASS | This feature explicitly implements the mobile-first mandate; shadcn/ui + Tailwind are standard Next.js 14 additions |
| III | Database — PostgreSQL with migrations | ✅ N/A | No database changes; UI-only revamp |
| IV | DRY / KISS / YAGNI | ✅ PASS | Shared primitives eliminate duplication; no speculative abstractions; YAGNI respected (only components required by spec) |
| V | Feature-Based Modular Architecture | ✅ PASS | New primitives go into `src/components/ui/` (shadcn) and `src/components/shared/`; business logic stays inside `src/features/`; no cross-feature coupling introduced |
| VI | Testing — unit + integration + Playwright E2E (mandatory) | ✅ PASS | Existing 13 Playwright specs preserved; 5 new responsive UI specs added (one per user story); all tests must pass before merge |
| VII | Fail-Safe / Fault-Tolerant | ✅ N/A | UI layer; error states styled consistently (FR-011); no new failure modes introduced |
| VIII–XII | Retry, idempotency, observability, rate limiting, events | ✅ N/A | These apply to backend services; this feature touches no backend code |
| XIII | Cost Efficiency | ✅ PASS | No new infrastructure; Tailwind CSS is zero-runtime; shadcn/ui copies components at build time (no extra bundle per-component at runtime beyond what is used) |
| XIV | CI/CD — Dockerfile + Jenkinsfile; lint → test → build order | ✅ PASS | Existing `Jenkinsfile` pipeline unchanged; `next build` will include revamped components |
| XV | Security baseline — input validation, sanitization, no secrets | ✅ PASS | No new API surfaces; all form inputs continue using `react-hook-form` + `zod` validation unchanged; no secrets added |
| XVI | Documentation | ✅ PASS | `quickstart.md` documents setup; component contracts documented in `contracts/` |
| XVII | OCR / QR core reliability | ✅ N/A | QR scanner UI component is reskinned only; logic in `useQrScanner` hook is untouched |

**Constitution Check Result: ALL GATES PASS — no violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/003-modern-dashboard-ui/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md    ← Phase 1 output (design tokens + component model)
├── quickstart.md    ← Phase 1 output (dev setup + shadcn/ui init steps)
├── contracts/
│   ├── shared-components.md   ← TypeScript prop interfaces for all shared primitives
│   └── design-tokens.md       ← Tailwind theme + CSS custom property contracts
└── tasks.md         ← Phase 2 output (created by /speckit.tasks — NOT by this command)
```

### Source Code (repository root)

```text
apps/frontend/
├── package.json               ← add tailwindcss, shadcn CLI deps
├── tailwind.config.ts         ← NEW: theme tokens, dark-mode strategy, content paths
├── postcss.config.mjs         ← NEW: tailwindcss plugin
├── components.json            ← NEW: shadcn/ui project config (generated by CLI)
├── src/
│   ├── app/
│   │   ├── globals.css        ← REPLACE: Tailwind directives + CSS custom properties (theme vars)
│   │   ├── layout.tsx         ← unchanged (root layout + AuthProvider)
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx   ← REVAMP: shadcn Card + Form + Input + Button
│   │   └── (dashboard)/
│   │       ├── layout.tsx     ← REVAMP: responsive shell (sidebar + Sheet drawer + TopBar)
│   │       ├── dashboard/
│   │       │   └── page.tsx   ← REVAMP: welcome card + ActionCard grid
│   │       ├── audit/
│   │       │   └── page.tsx   ← REVAMP: DataTable + empty state
│   │       └── settings/
│   │           ├── users/page.tsx        ← REVAMP: DataTable + Dialog + action badges
│   │           ├── roles/page.tsx        ← REVAMP: DataTable + Dialog
│   │           ├── organizations/page.tsx← REVAMP: DataTable + Dialog
│   │           ├── invitations/page.tsx  ← REVAMP: DataTable + Dialog
│   │           └── permissions/page.tsx  ← REVAMP: DataTable
│   ├── components/
│   │   ├── ui/                ← AUTO-GENERATED by shadcn CLI (do not hand-edit)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── table.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── separator.tsx
│   │   │   └── avatar.tsx
│   │   ├── layout/            ← NEW: hand-authored layout primitives
│   │   │   ├── sidebar.tsx           ← desktop persistent sidebar
│   │   │   ├── mobile-drawer.tsx     ← Sheet-based slide-in nav for mobile
│   │   │   ├── top-bar.tsx           ← mobile top bar with hamburger toggle
│   │   │   └── dashboard-shell.tsx   ← composes sidebar + drawer + main area
│   │   └── shared/            ← NEW: reusable cross-feature components
│   │       ├── data-table.tsx        ← wrapper with scroll + empty state + hover rows
│   │       ├── action-card.tsx       ← navigable card with icon + animation
│   │       ├── form-field.tsx        ← label + input + error message, consistent styling
│   │       ├── page-header.tsx       ← consistent h1 + optional subtitle
│   │       ├── status-badge.tsx      ← Active/Inactive/Locked badge variants
│   │       └── confirm-dialog.tsx    ← reusable yes/no dialog built on Dialog
│   └── features/
│       ├── auth/
│       │   └── components/
│       │       └── navigation.tsx    ← REVAMP: use layout/sidebar + mobile-drawer internally
│       ├── shipments/
│       │   └── components/
│       │       ├── PdfUploader.tsx   ← REVAMP: styled drop zone + animated upload button
│       │       ├── ConflictReview.tsx← REVAMP: DataTable-based conflict list
│       │       ├── ImportStatus.tsx  ← REVAMP: Card-based status display
│       │       ├── UploadHistory.tsx ← REVAMP: DataTable + empty state
│       │       ├── QrScanner.tsx     ← REVAMP: styled scanner UI; hook unchanged
│       │       ├── ShipmentDetail.tsx← REVAMP: Card-based detail view
│       │       └── LinehaulDetail.tsx← REVAMP: Card-based detail view
│       ├── users/
│       │   └── components/
│       │       ├── user-edit-form.tsx        ← REVAMP: FormField primitives
│       │       ├── inactivate-user-dialog.tsx← REVAMP: ConfirmDialog
│       │       └── unlock-user-dialog.tsx    ← REVAMP: ConfirmDialog
│       ├── organizations/
│       │   └── components/
│       │       ├── organization-form.tsx     ← REVAMP: FormField primitives
│       │       └── deactivate-org-dialog.tsx ← REVAMP: ConfirmDialog
│       ├── invitations/
│       │   └── components/
│       │       └── invitation-form.tsx       ← REVAMP: FormField primitives
│       ├── roles/
│       │   └── components/
│       │       └── role-permissions-panel.tsx← REVAMP: Card + checkbox list
│       └── permissions/
│           └── components/
│               └── permission-form.tsx       ← REVAMP: FormField primitives
└── e2e/
    ├── [existing 13 spec files — UNCHANGED]
    └── ui-responsive/          ← NEW: responsive + design system E2E tests
        ├── navigation.spec.ts  ← User Story 1: sidebar responsive tests
        ├── design-system.spec.ts← User Story 2: hover/focus/modal tests
        ├── dashboard-home.spec.ts← User Story 3: welcome card + action grid
        ├── upload-mobile.spec.ts ← User Story 4: PDF upload on mobile viewport
        └── settings-mobile.spec.ts← User Story 5: admin tables on small screens
```

**Structure Decision**: Option 2 (Web application) — changes are confined entirely to
`apps/frontend/`. The backend at `apps/backend/` is untouched. Shared logic in
`packages/shared/` is not modified (there is no UI code there). The layout follows the
constitution's frontend module structure: `features/` for business logic, `components/` for
generic UI primitives, `shared/` for cross-cutting utilities.

## Complexity Tracking

> No constitution violations — this table is intentionally empty.

All design decisions follow KISS and YAGNI: shadcn/ui components are copied into the project
(no runtime dependency on a component CDN), Tailwind is zero-runtime, and the responsive layout
uses a single Sheet component rather than a bespoke animation library.
