---
description: "Task list for Modern Dashboard UI Revamp (003-modern-dashboard-ui)"
---

# Tasks: Modern Responsive Dashboard UI Revamp

**Feature**: `003-modern-dashboard-ui`
**Input**: Design documents from `/specs/003-modern-dashboard-ui/`
**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅ · quickstart.md ✅

**Tests**: Playwright E2E tests are **MANDATORY** per project constitution §VI. Five new
`e2e/ui-responsive/` spec files are included (one per user story). All 13 existing Playwright
specs must pass without modification after every revamp task.

**Scope boundary**: ALL tasks touch only `apps/frontend/`. No changes to `apps/backend/` or
`packages/shared/`. All `data-testid` attributes MUST be preserved verbatim (see
`contracts/shared-components.md §3` for the full testid inventory).

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each story.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5 map to spec.md P1–P5)
- Exact file paths are included in every task description

---

## Phase 1: Setup (Tailwind CSS + shadcn/ui Installation)

**Purpose**: Add Tailwind CSS v4 and shadcn/ui to `apps/frontend`. These steps MUST be
completed sequentially — each command depends on the previous one.

- [ ] T001 Install Tailwind CSS v4 and PostCSS dependencies (`tailwindcss@^4.2`, `postcss`, `autoprefixer`, `tailwindcss-animate`) in `apps/frontend/package.json`
- [ ] T002 Initialise shadcn/ui via `npx shadcn@latest init` in `apps/frontend/` — generates `components.json`, `postcss.config.mjs`, `tailwind.config.ts`, and `src/lib/utils.ts` (cn helper)
- [ ] T003 Add required shadcn/ui component set via `npx shadcn@latest add button input label card badge table dialog sheet dropdown-menu form separator avatar` — populates `apps/frontend/src/components/ui/`

---

## Phase 2: Foundational (Design System Configuration)

**Purpose**: Establish the single source of truth for all design tokens — the CSS custom
properties and Tailwind configuration. Every subsequent task depends on these files being
correct. Both tasks operate on different files and can run in parallel.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [P] Replace `apps/frontend/src/app/globals.css` with Tailwind v4 `@import "tailwindcss"` directive and the full CSS custom property token block defined in `contracts/design-tokens.md §3` (includes `:root {}` palette, sidebar tokens, dark-mode overrides, and base reset)
- [ ] T005 [P] Overwrite `apps/frontend/tailwind.config.ts` with the color alias map, `borderRadius`, `keyframes` (`accordion-down/up`), and `plugins: [require('tailwindcss-animate')]` exactly as specified in `contracts/design-tokens.md §2`

**Checkpoint**: Design system ready — Tailwind utility classes resolve to CSS variables, `cn()` helper available at `src/lib/utils.ts`, all shadcn/ui primitives present in `src/components/ui/`. User story implementation can now begin.

---

## Phase 3: User Story 1 — Responsive Navigation on Any Device (Priority: P1) 🎯 MVP

**Goal**: Replace the fixed sidebar with a responsive layout — permanent sidebar at `≥ 1024 px`,
Sheet-based hamburger drawer at `< 1024 px`. Establishes the layout shell that every other page builds upon.

**Independent Test**: Open the app on a 375 px viewport — verify the hamburger icon is visible, tapping it reveals all nav links with a slide-in animation, tapping any link navigates and closes the drawer. On a 1280 px viewport verify the sidebar is permanently visible with no toggle control.

### Playwright E2E Tests for User Story 1

- [ ] T006 [P] [US1] Write Playwright E2E spec covering all 5 US1 acceptance scenarios (hamburger visible at 375 px, drawer opens/closes, nav link closes drawer, sidebar permanent at 1280 px, seamless resize transition) in `apps/frontend/e2e/ui-responsive/navigation.spec.ts` — configure `test.use({ viewport: { width: 375, height: 812 } })` for mobile tests and `{ width: 1280, height: 800 }` for desktop tests; use `[aria-label="Open menu"]` selector for hamburger and `nav[data-sidebar]` for desktop sidebar

### Layout Component Implementation for User Story 1

- [ ] T007 [P] [US1] Create `Sidebar` Client Component (desktop persistent nav) implementing the `SidebarProps` interface from `contracts/shared-components.md §1.1` — dark slate-900 background (`bg-sidebar`), brand name header, labelled nav section groups with `<NavLink>` items, sign-out action at bottom — in `apps/frontend/src/components/layout/sidebar.tsx`
- [ ] T008 [P] [US1] Create `MobileDrawer` Client Component (Sheet-based slide-in nav) implementing `MobileDrawerProps` from `contracts/shared-components.md §1.3` — wraps shadcn `<Sheet side="left">`, renders identical nav links as Sidebar, calls `onClose()` on every nav link `onClick`, suppresses slide animation via `motion-safe:` variants — in `apps/frontend/src/components/layout/mobile-drawer.tsx`
- [ ] T009 [P] [US1] Create `TopBar` Client Component (mobile-only header) implementing `TopBarProps` from `contracts/shared-components.md §1.4` — renders hamburger `<Button variant="ghost" aria-label="Open menu">` with `<Menu>` Lucide icon, brand title, fixed height `h-14 border-b bg-background` — in `apps/frontend/src/components/layout/top-bar.tsx`
- [ ] T010 [US1] Create `DashboardShell` Client Component composing `Sidebar` + `TopBar` + `MobileDrawer` + `<main>` area — manages `isOpen` state via local `useState`, provides `toggle`/`close` handlers, renders `<Sidebar>` inside `hidden lg:flex w-60 flex-col`, `<TopBar>` inside `flex lg:hidden`, `<MobileDrawer>` controlled by `isOpen`, and `<main className="flex-1 overflow-auto p-4 lg:p-8">` — adds `useEffect` to call `close()` when viewport widens past `1024 px` — in `apps/frontend/src/components/layout/dashboard-shell.tsx`
- [ ] T011 [US1] Revamp `apps/frontend/src/app/(dashboard)/layout.tsx` — replace the inline-style `<div style={{ display:'flex'… }}>` + `<Navigation />` structure with `<DashboardShell>{children}</DashboardShell>`; preserve the existing `useAuth` redirect guard logic unchanged
- [ ] T012 [US1] Revamp `apps/frontend/src/features/auth/components/navigation.tsx` — remove all inline `style` props, re-implement using `Sidebar` and `MobileDrawer` layout primitives for any remaining navigation markup; ensure all nav links and sign-out action are present with the same routing behaviour

**Checkpoint**: User Story 1 fully functional — responsive layout works on mobile and desktop, hamburger drawer opens/closes, all nav links navigate correctly. Playwright `navigation.spec.ts` passes.

---

## Phase 4: User Story 2 — Modern Visual Design with Consistent Components (Priority: P2)

**Goal**: Extract six shared UI primitives consumed across all pages — `DataTable`, `FormField`,
`StatusBadge`, `ConfirmDialog`, `PageHeader` — and revamp the login page as the first full-page
demonstration of the design system. Every interactive element gains hover/focus transitions.

**Independent Test**: Navigate login → dashboard home → shipment upload → settings/users. Confirm all buttons share the same style, form fields have consistent focus rings, modals animate in with fade+scale, hovering any interactive element produces a visible transition within 200 ms.

### Playwright E2E Tests for User Story 2

- [ ] T013 [P] [US2] Write Playwright E2E spec covering all 5 US2 acceptance scenarios (button hover shadow, input focus ring, modal fade+scale animation, consistent button style across pages, table row hover) at 1280 px desktop viewport in `apps/frontend/e2e/ui-responsive/design-system.spec.ts` — use `page.hover()` + `toHaveCSS()` for transition assertions; check `[role="dialog"]` visibility for modal tests

### Shared Component Implementation for User Story 2

- [ ] T014 [P] [US2] Create `DataTable<T>` generic shared component implementing `DataTableProps<T>` interface from `contracts/shared-components.md §2.1` — outer `<div className="overflow-x-auto rounded-md border">`, `<thead className="bg-muted/50">`, row `hover:bg-muted/30 motion-safe:transition-colors motion-safe:duration-150`, empty-state `<td>` with `data-testid` forwarding support for `history-empty` — in `apps/frontend/src/components/shared/data-table.tsx`
- [ ] T015 [P] [US2] Create `FormField` shared component implementing `FormFieldProps` from `contracts/shared-components.md §2.3` — wraps `<label>`, `{children}` input slot, optional hint `<p>`, and error `<span className="flex items-center gap-1 text-sm text-destructive"><AlertCircle size={14}/> {error}</span>` (FR-011) — in `apps/frontend/src/components/shared/form-field.tsx`
- [ ] T016 [P] [US2] Create `StatusBadge` shared component implementing `StatusBadgeProps` with `StatusVariant` type from `contracts/shared-components.md §2.4` — applies the six variant Tailwind class mappings (`active`, `inactive`, `locked`, `pending`, `success`, `error`) using shadcn `<Badge>` as base — in `apps/frontend/src/components/shared/status-badge.tsx`
- [ ] T017 [P] [US2] Create `ConfirmDialog` shared component implementing `ConfirmDialogProps` from `contracts/shared-components.md §2.5` — built on shadcn `Dialog` + `DialogHeader`/`DialogFooter`; confirm button uses `variant="destructive"` when `destructive={true}`; applies `motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95` and matching close animations (FR-006, FR-007) — in `apps/frontend/src/components/shared/confirm-dialog.tsx`
- [ ] T018 [P] [US2] Create `PageHeader` shared component implementing `PageHeaderProps` from `contracts/shared-components.md §2.6` — renders `<div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">` with `<h1 className="text-2xl font-bold tracking-tight">` and optional right-aligned `action` slot — in `apps/frontend/src/components/shared/page-header.tsx`
- [ ] T019 [US2] Revamp login page with centered Card layout — replace the root `<div>` with `<div className="flex min-h-screen items-center justify-center bg-muted/40">`, wrap the form in shadcn `<Card>` + `<CardHeader>` + `<CardContent>` + `<CardFooter>`, replace bare `<input>` elements with `<FormField>` + shadcn `<Input>` using the existing `react-hook-form` + `zod` logic unchanged, replace submit `<button>` with shadcn `<Button className="w-full motion-safe:transition-shadow motion-safe:hover:shadow-md">`, style the error state with `text-destructive flex items-center gap-1` (FR-013) — in `apps/frontend/src/app/(auth)/login/page.tsx`

**Checkpoint**: User Story 2 fully functional — all shared primitives are importable and rendered correctly, login page is visually polished, all interactive elements have visible hover/focus transitions. Playwright `design-system.spec.ts` passes.

---

## Phase 5: User Story 3 — Dashboard Home Page with Summary Cards (Priority: P3)

**Goal**: Upgrade the dashboard home from plain text to a welcome card with the user's name and
role badge, plus a responsive grid of three `ActionCard` components linking to Upload, History,
and QR Scan.

**Independent Test**: Log in and verify the dashboard home shows a welcome message with the username, a role `StatusBadge`, and three `ActionCard` components with icons. Resize to 375 px and confirm cards stack to a single column without horizontal scrolling.

### Playwright E2E Tests for User Story 3

- [ ] T020 [P] [US3] Write Playwright E2E spec covering all 5 US3 acceptance scenarios (welcome message with username, role indicator, three action cards visible, single-column at 375 px, multi-column grid at 1280 px, card click navigates correctly) in `apps/frontend/e2e/ui-responsive/dashboard-home.spec.ts` — test at both `375 × 812` and `1280 × 800` viewports; use `data-testid` on cards where present and text selectors for the welcome heading

### Implementation for User Story 3

- [ ] T021 [P] [US3] Create `ActionCard` shared component implementing `ActionCardProps` from `contracts/shared-components.md §2.2` — renders a `next/link` `<a>` with `group` class, `motion-safe:transition-all motion-safe:duration-150 motion-safe:hover:shadow-md motion-safe:hover:-translate-y-0.5`, Lucide icon in a `bg-primary/10` rounded container, title, and description; supports `data-testid` and `focus-visible:ring-2 focus-visible:ring-ring` for keyboard navigation (SC-006) — in `apps/frontend/src/components/shared/action-card.tsx`
- [ ] T022 [US3] Revamp dashboard home page — replace plain-text username/orgId display with: (a) a welcome `<Card>` showing `user.username`, a `<StatusBadge>` for the user's primary role, and the organisation name; (b) a `<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">` containing three `<ActionCard>` components for Upload Shipments (`href="/shipments/upload"`, `icon=Upload`), Upload History (`href="/shipments/history"`, `icon=History`), and QR Scan (`href="/shipments/scan"`, `icon=QrCode`); add `<PageHeader title="Dashboard" />` — in `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

**Checkpoint**: User Story 3 fully functional — welcome card and action grid render correctly on all viewports, cards navigate to correct routes, layout reflows to single column on mobile. Playwright `dashboard-home.spec.ts` passes.

---

## Phase 6: User Story 4 — Mobile-Friendly PDF Upload and Drag-and-Drop Zone (Priority: P4)

**Goal**: Make all shipment workflow components (uploader, conflict review, import status, upload
history, QR scanner, shipment/linehaul detail) usable on a 375 px viewport — large tappable
zones, scrollable conflict rows, consistent error styling. All `data-testid` attributes
preserved throughout.

**Independent Test**: On a 375 px viewport, navigate to Shipments → Import PDF. Confirm the drop zone is tappable (opens native file picker), uploading a PDF shows an animated loading indicator, conflict rows are scrollable without horizontal overflow, and non-PDF error messages appear in the shared destructive style.

### Playwright E2E Tests for User Story 4

- [ ] T023 [P] [US4] Write Playwright E2E spec covering all 4 US4 acceptance scenarios (drop zone tappable on mobile, animated loading indicator on upload, conflict rows scrollable at 375 px, PDF-type error styled consistently) in `apps/frontend/e2e/ui-responsive/upload-mobile.spec.ts` — configure `test.use({ viewport: { width: 375, height: 812 } })`; target `data-testid="upload-submit"`, `data-testid="file-type-error"`, `data-testid="conflict-row"`, `data-testid="conflict-review"` selectors from the preserved testid contract

### Shipment Component Revamps for User Story 4 (all files are independent — run in parallel)

- [ ] T024 [P] [US4] Revamp `PdfUploader` — replace inline-style drop zone with Tailwind `border-2 border-dashed rounded-lg p-8 text-center motion-safe:transition-colors motion-safe:hover:border-primary`, replace bare `<button>` submit with shadcn `<Button data-testid="upload-submit">` showing a `<Loader2 className="animate-spin">` Lucide icon during upload (FR-004 animated loading), preserve `data-testid="file-type-error"` on the error message element; remove all `style={{…}}` props — in `apps/frontend/src/features/shipments/components/PdfUploader.tsx`
- [ ] T025 [P] [US4] Revamp `ConflictReview` — replace bare `<table>` with `<DataTable>` shared component passing `data-testid="conflict-review"` as the outer wrapper, `rowDataTestId="conflict-row"`, preserve `data-testid="conflict-action-overwrite"` and `data-testid="conflict-action-skip"` on shadcn `<Button>` elements via prop spread, preserve `data-testid="resolve-conflicts-submit"` on the submit `<Button>`; table becomes horizontally scrollable via DataTable's `overflow-x-auto` container — in `apps/frontend/src/features/shipments/components/ConflictReview.tsx`
- [ ] T026 [P] [US4] Revamp `ImportStatus` — wrap in shadcn `<Card>`, preserve `data-testid="import-status"` on the outer Card `<div>`, preserve `data-testid="rows-imported"` on the count `<td>` element, replace inline styles with Tailwind utilities (`text-sm`, `text-muted-foreground`, `font-medium`) — in `apps/frontend/src/features/shipments/components/ImportStatus.tsx`
- [ ] T027 [P] [US4] Revamp `UploadHistory` — replace bare `<table>` with `<DataTable rowDataTestId="history-row" data-testid="history-table">` with an `emptyMessage` prop value, render the empty-state `<p data-testid="history-empty">` inside or alongside DataTable for the zero-row case (preserving testid contract from `contracts/shared-components.md §3.4`), add `<PageHeader title="Upload History" />` — in `apps/frontend/src/features/shipments/components/UploadHistory.tsx`
- [ ] T028 [P] [US4] Revamp `QrScanner` — replace all `style={{…}}` props on the scanner container, status messages, and action buttons with Tailwind utility classes; preserve all 9 `data-testid` attributes verbatim (`start-scanner`, `permission-prompt`, `permission-denied`, `no-camera`, `camera-in-use`, `scanner-status`, `shipment-not-found`, `invalid-qr-format`, `scan-error`) on the exact same element types; the `useQrScanner` hook logic remains completely unchanged — in `apps/frontend/src/features/shipments/components/QrScanner.tsx`
- [ ] T029 [P] [US4] Revamp `ShipmentDetail` — replace inline-style container with shadcn `<Card>` layout, preserve `data-testid="shipment-detail"` on the outermost `<div>` wrapper, apply Tailwind typography classes (`text-sm`, `font-medium`, `text-muted-foreground`) to all detail fields, add horizontal scroll to any embedded table — in `apps/frontend/src/features/shipments/components/ShipmentDetail.tsx`
- [ ] T030 [P] [US4] Revamp `LinehaulDetail` — wrap in shadcn `<Card>`, preserve `data-testid="linehaul-detail"` on the outer container, `data-testid="linehaul-trip-header"` on the `<details>` element (no element type change), `data-testid="scan-again-button"` on the shadcn `<Button>` via prop spread; replace all inline styles with Tailwind utilities — in `apps/frontend/src/features/shipments/components/LinehaulDetail.tsx`

**Checkpoint**: User Story 4 fully functional — all shipment components render with Tailwind styles, drop zone is tappable on mobile, conflict rows scroll horizontally, all testids preserved. Playwright `upload-mobile.spec.ts` passes.

---

## Phase 7: User Story 5 — Settings and Admin Pages on Small Screens (Priority: P5)

**Goal**: Make all settings pages (Users, Roles, Organisations, Invitations, Permissions) and the
Audit Log page usable on tablet/phone — horizontally scrollable `DataTable`, modals that fit the
viewport, tappable action buttons, and `ConfirmDialog` for destructive actions.

**Independent Test**: On a 768 px viewport, navigate to Settings → Users. Confirm the table is scrollable, no column is clipped, the Edit modal opens fully within the viewport with all inputs accessible, and clicking outside or the close button closes the modal with a fade-out animation.

### Playwright E2E Tests for User Story 5

- [ ] T031 [P] [US5] Write Playwright E2E spec covering all 3 US5 acceptance scenarios (users table scrollable at 768 px, Edit modal fully visible within viewport, modal closes with fade-out on backdrop click or close button) in `apps/frontend/e2e/ui-responsive/settings-mobile.spec.ts` — configure `test.use({ viewport: { width: 768, height: 1024 } })`; use `[role="dialog"]` for modal and `.overflow-x-auto` for table scroll container assertions

### Settings Page Revamps for User Story 5 (all files are independent — run in parallel)

- [ ] T032 [P] [US5] Revamp `settings/users/page.tsx` — replace inline-style `<table>` with `<DataTable>` shared component (columns: name, username, position, status, actions), replace `<h1 style=…>` with `<PageHeader title="Users" action={<InviteButton />}>`, wrap status cells in `<StatusBadge variant="active"|"inactive"|"locked">`, replace custom modal `<div>` with shadcn `<Dialog>` — in `apps/frontend/src/app/(dashboard)/settings/users/page.tsx`
- [ ] T033 [P] [US5] Revamp `user-edit-form.tsx` — replace bare `<input>` elements with `<FormField>` shared component wrapping shadcn `<Input>` for name, position, employeeNumber, and phoneNumber fields; preserve all existing `react-hook-form` register/validation logic; replace submit `<button>` with shadcn `<Button>` — in `apps/frontend/src/features/users/components/user-edit-form.tsx`
- [ ] T034 [P] [US5] Revamp `inactivate-user-dialog.tsx` — replace inline modal markup with `<ConfirmDialog destructive={true} title="Inactivate User" onConfirm={handleInactivate}>`, preserve all existing API call logic in `onConfirm` — in `apps/frontend/src/features/users/components/inactivate-user-dialog.tsx`
- [ ] T035 [P] [US5] Revamp `unlock-user-dialog.tsx` — replace inline modal markup with `<ConfirmDialog title="Unlock User" onConfirm={handleUnlock}>`, preserve all existing API call logic in `onConfirm` — in `apps/frontend/src/features/users/components/unlock-user-dialog.tsx`
- [ ] T036 [P] [US5] Revamp `settings/roles/page.tsx` — replace inline-style `<table>` with `<DataTable>` shared component (columns: name, permissions count, actions), replace `<h1 style=…>` with `<PageHeader title="Roles">`, add empty-state message via DataTable `emptyMessage` prop — in `apps/frontend/src/app/(dashboard)/settings/roles/page.tsx`
- [ ] T037 [P] [US5] Revamp `role-permissions-panel.tsx` — wrap permission groups in shadcn `<Card>` + `<CardContent>`, replace bare checkbox list with Tailwind-styled checkbox rows (`flex items-center gap-2 py-1`), replace any inline styles with Tailwind utilities; hook and API logic unchanged — in `apps/frontend/src/features/roles/components/role-permissions-panel.tsx`
- [ ] T038 [P] [US5] Revamp `settings/organizations/page.tsx` — replace inline-style `<table>` with `<DataTable>` (columns: name, status, actions), replace `<h1>` with `<PageHeader title="Organisations">`, wrap status cells in `<StatusBadge>`, replace any inline confirm prompt with `<ConfirmDialog>` — in `apps/frontend/src/app/(dashboard)/settings/organizations/page.tsx`
- [ ] T039 [P] [US5] Revamp `organization-form.tsx` — replace bare `<input>` with `<FormField>` + shadcn `<Input>` for the organisation name field; preserve `react-hook-form` validation; replace submit `<button>` with shadcn `<Button>` — in `apps/frontend/src/features/organizations/components/organization-form.tsx`
- [ ] T040 [P] [US5] Revamp `deactivate-org-dialog.tsx` — replace inline modal markup with `<ConfirmDialog destructive={true} title="Deactivate Organisation" onConfirm={handleDeactivate}>`; preserve existing API call logic — in `apps/frontend/src/features/organizations/components/deactivate-org-dialog.tsx`
- [ ] T041 [P] [US5] Revamp `settings/invitations/page.tsx` — replace inline-style `<table>` with `<DataTable>` (columns: email, username, role, status, sent date, actions), replace `<h1>` with `<PageHeader title="Invitations" action={<InviteButton />}>`, wrap status cells in `<StatusBadge variant="pending"|"active"|"inactive">` — in `apps/frontend/src/app/(dashboard)/settings/invitations/page.tsx`
- [ ] T042 [P] [US5] Revamp `invitation-form.tsx` — replace bare `<input>` and `<select>` elements with `<FormField>` + shadcn `<Input>` / `<Select>` for username, email, and role fields; preserve `react-hook-form` + `zod` validation; replace submit `<button>` with shadcn `<Button>` — in `apps/frontend/src/features/invitations/components/invitation-form.tsx`
- [ ] T043 [P] [US5] Revamp `settings/permissions/page.tsx` — replace inline-style `<table>` with `<DataTable>` (columns: name, key, description, actions), replace `<h1>` with `<PageHeader title="Permissions">`, ensure empty-state message renders via DataTable when no permissions exist — in `apps/frontend/src/app/(dashboard)/settings/permissions/page.tsx`
- [ ] T044 [P] [US5] Revamp `permission-form.tsx` — replace bare `<input>` elements with `<FormField>` + shadcn `<Input>` for permission name and key fields; preserve `react-hook-form` validation; replace submit `<button>` with shadcn `<Button>` — in `apps/frontend/src/features/permissions/components/permission-form.tsx`
- [ ] T045 [P] [US5] Revamp `audit/page.tsx` — replace inline-style `<table>` with `<DataTable>` (columns: timestamp, user, action, entity, details), replace `<h1>` with `<PageHeader title="Audit Log">`, ensure horizontally scrollable on 375 px viewport via DataTable's `overflow-x-auto` wrapper — in `apps/frontend/src/app/(dashboard)/audit/page.tsx`

**Checkpoint**: User Story 5 fully functional — all settings and audit pages use shared DataTable with horizontal scroll, modals are viewport-safe, all action buttons are tappable on tablet. Playwright `settings-mobile.spec.ts` passes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify integrity across the whole revamped surface — TypeScript types, lint rules,
all Playwright specs (existing + new), and production build. These tasks are sequential to catch
regressions before the final validation gate.

- [ ] T046 Run `npm run type-check` in `apps/frontend/` and resolve any TypeScript type errors introduced by the revamp — common sources: missing `data-testid` prop types on shadcn wrappers, incorrect `LucideIcon` import type for `ActionCardProps`, generic `DataTableProps<T>` type inference issues
- [ ] T047 Run `npm run lint` in `apps/frontend/` and remove any remaining inline `style={{…}}` props found across all revamped components (FR-002); confirm no ESLint errors or warnings related to unused imports or missing `key` props
- [ ] T048 Run the complete Playwright E2E suite (`npm run test:e2e` in `apps/frontend/`) covering all 13 existing spec files plus the 5 new `e2e/ui-responsive/` specs — all 18 spec files must pass with zero failures; any failure indicates a missing `data-testid` or a broken feature and must be fixed before proceeding
- [ ] T049 Run `npm run build` in `apps/frontend/` to confirm Tailwind CSS purge completes without errors, Next.js compiles all 20+ revamped pages and components without TypeScript or build errors, and `next/font` or any CSS import warnings are resolved

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup: T001→T002→T003)
  └── Phase 2 (Foundational: T004, T005 in parallel)
        └── Phase 3 (US1 Navigation: T006–T012)
              └── Phase 4 (US2 Design System: T013–T019)
                    ├── Phase 5 (US3 Dashboard Home: T020–T022)
                    ├── Phase 6 (US4 PDF Upload: T023–T030)
                    └── Phase 7 (US5 Settings: T031–T045)
                          └── Phase 8 (Polish: T046→T047→T048→T049)
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — no dependency on other user stories; establishes layout shell for all others
- **US2 (P2)**: Depends on Phase 3 (US1 layout shell must exist for page-level testing) — no dependency on US3/US4/US5
- **US3 (P3)**: Depends on Phase 4 (needs `StatusBadge` for role badge, `PageHeader`); also needs US1 layout for page rendering
- **US4 (P4)**: Depends on Phase 4 (needs `DataTable`, `PageHeader`, `FormField`); independent of US3/US5
- **US5 (P5)**: Depends on Phase 4 (needs `DataTable`, `FormField`, `StatusBadge`, `ConfirmDialog`, `PageHeader`); independent of US3/US4

### Within Each User Story

- E2E test task: written in parallel with implementation (different file, no implementation dependency)
- For US1: T007/T008/T009 (components) in parallel → T010 (DashboardShell) → T011 (layout.tsx) → T012 (navigation.tsx)
- For US2: T014/T015/T016/T017/T018 (shared components) in parallel → T019 (login page, depends on T015)
- For US3/US4/US5: all implementation tasks are different files — full parallel execution
- Polish phase (Phase 8): strictly sequential T046→T047→T048→T049

---

## Parallel Execution Examples

### Phase 2: Foundational (2 tasks, fully parallel)

```
Parallel:
  Task T004: Write globals.css CSS token definitions
  Task T005: Configure tailwind.config.ts
```

### Phase 3: User Story 1 — Layout Components (3-way parallel then sequential)

```
Parallel:
  Task T006: Write navigation.spec.ts E2E tests
  Task T007: Create sidebar.tsx
  Task T008: Create mobile-drawer.tsx
  Task T009: Create top-bar.tsx

Then sequential:
  Task T010: Create dashboard-shell.tsx (depends on T007, T008, T009)
  Task T011: Revamp (dashboard)/layout.tsx (depends on T010)
  Task T012: Revamp navigation.tsx (depends on T010)
```

### Phase 4: User Story 2 — Shared Components (5-way parallel then sequential)

```
Parallel:
  Task T013: Write design-system.spec.ts E2E tests
  Task T014: Create data-table.tsx
  Task T015: Create form-field.tsx
  Task T016: Create status-badge.tsx
  Task T017: Create confirm-dialog.tsx
  Task T018: Create page-header.tsx

Then sequential:
  Task T019: Revamp login/page.tsx (depends on T015 FormField)
```

### Phase 5: User Story 3 — Dashboard Home (2-way parallel)

```
Parallel:
  Task T020: Write dashboard-home.spec.ts E2E tests
  Task T021: Create action-card.tsx

Then sequential:
  Task T022: Revamp dashboard/page.tsx (depends on T021)
```

### Phase 6: User Story 4 — Shipment Components (8-way parallel)

```
Parallel:
  Task T023: Write upload-mobile.spec.ts E2E tests
  Task T024: Revamp PdfUploader.tsx
  Task T025: Revamp ConflictReview.tsx
  Task T026: Revamp ImportStatus.tsx
  Task T027: Revamp UploadHistory.tsx
  Task T028: Revamp QrScanner.tsx
  Task T029: Revamp ShipmentDetail.tsx
  Task T030: Revamp LinehaulDetail.tsx
```

### Phase 7: User Story 5 — Settings Pages (15-way parallel)

```
Parallel:
  Task T031: Write settings-mobile.spec.ts E2E tests
  Task T032: Revamp settings/users/page.tsx
  Task T033: Revamp user-edit-form.tsx
  Task T034: Revamp inactivate-user-dialog.tsx
  Task T035: Revamp unlock-user-dialog.tsx
  Task T036: Revamp settings/roles/page.tsx
  Task T037: Revamp role-permissions-panel.tsx
  Task T038: Revamp settings/organizations/page.tsx
  Task T039: Revamp organization-form.tsx
  Task T040: Revamp deactivate-org-dialog.tsx
  Task T041: Revamp settings/invitations/page.tsx
  Task T042: Revamp invitation-form.tsx
  Task T043: Revamp settings/permissions/page.tsx
  Task T044: Revamp permission-form.tsx
  Task T045: Revamp audit/page.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T005)
3. Complete Phase 3: User Story 1 (T006–T012)
4. **STOP and VALIDATE**: On a 375 px viewport verify hamburger, drawer, nav links work; on 1280 px verify permanent sidebar. Confirm `navigation.spec.ts` passes.
5. Deploy/demo the responsive layout shell — every subsequent story adds content inside it

### Incremental Delivery

1. Phase 1 + 2 → Design system token foundation ready
2. Phase 3 (US1) → Responsive layout shell → **Demo: mobile navigation works** ✅
3. Phase 4 (US2) → Shared components + login revamp → **Demo: consistent design language across all interactive elements** ✅
4. Phase 5 (US3) → Dashboard home → **Demo: branded welcome screen with quick-access cards** ✅
5. Phase 6 (US4) → Shipment workflows → **Demo: mobile-friendly PDF upload end-to-end** ✅
6. Phase 7 (US5) → Settings pages → **Demo: full admin experience on tablet** ✅
7. Phase 8 → Final validation gate → **Ship** 🚀

### Parallel Team Strategy

With 3 developers after Phase 2 completes:

- **Developer A**: US1 (layout) → US2 (shared components) → US3 (dashboard home)
- **Developer B**: US4 (all 7 shipment component revamps in parallel)
- **Developer C**: US5 (all 15 settings page/form/dialog revamps in parallel)

Stories do not share files — zero merge conflicts when worked in parallel.

---

## Notes

- `[P]` tasks operate on different files with no dependency on incomplete sibling tasks in the same phase
- `[USn]` label maps each task to the user story it delivers — use for traceability against spec.md acceptance scenarios
- **Never** add inline `style={{…}}` props to any revamped component (FR-002) — use Tailwind utility classes only
- **Always** prefix non-essential animation classes with `motion-safe:` (FR-007, SC-007)
- **Always** preserve every `data-testid` value verbatim — consult `contracts/shared-components.md §3` before editing any component that carries a testid
- **Never** modify files in `apps/backend/` or `packages/shared/` (FR-012, plan.md constraint)
- Commit after each phase checkpoint or logical task group; validate with `npm run type-check` before each commit
- If a user story's Playwright spec fails unexpectedly, check the `data-testid` preservation contract first — this is the most common regression source
