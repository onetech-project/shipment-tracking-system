# SLA Dashboard Redesign Design

**Date:** 2026-05-05
**Branch:** feat/pnl-dashboard

## Overview

Five coordinated changes to the shipment tracking frontend:
1. New dedicated SLA Monitoring page at `/sla`
2. Remove the shipment table from the dashboard (keep SLA cards)
3. SLA card route clicks navigate to the SLA page with active filters
4. Odd/even row coloring on all tables across the app
5. Sidebar height independent of content overflow

---

## 1. New SLA Page

### Route
`apps/frontend/src/app/(dashboard)/sla/page.tsx`

### Component
`apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

### Behavior
- Renders all 5 alert cards (`DashboardAlertCards`) + full `AirShipmentTable`
- Filter state is URL-driven: `?alert=<alertKey>&route=<routeName>`
- On mount, reads `searchParams` to initialize `alertFilter` and `routeFilter` state
- When user clicks a route within a card, calls `router.replace` to update URL params in-place (table re-filters without full navigation)
- All existing table features preserved: sorting, pagination, column visibility, batch operations, search

### Sidebar Link
New `NavLink` added in `sidebar.tsx` under the "Air Shipments" section, between "P&L Analysis" and "Google Sheet Config":
- Label: `SLA Monitoring`
- Icon: `ShieldAlert` (already used for TJPH Breach card — consistent iconography)
- href: `/sla`
- Active detection: existing `NavLink` `startsWith` logic handles it automatically

---

## 2. Dashboard Changes

### Remove from `dashboard/page.tsx`
- `AirShipmentTable` component and its JSX
- State/hooks exclusively serving the table: `search`, `debouncedSearch`, `pagination`, `sorting`, `columnVisibility`, `selectedRows`, `batchDeleteDialog`, `lockDialog`
- Imports no longer needed after removal

### Keep
- Welcome card
- `DashboardAlertCards` with all 5 cards
- Sync status badge
- `GeneralParamsModal`
- `days` state (still needed by alert cards for the summary query)

### `onRouteSelect` Change
The dashboard currently passes `onRouteSelect` to `DashboardAlertCards` which sets local `alertFilter`/`routeFilter` state to filter the (now-removed) table. After the change:

```ts
const router = useRouter()
const handleRouteSelect = (alert: DashboardAlertKey, route: string) => {
  router.push(`/sla?alert=${alert}&route=${encodeURIComponent(route)}`)
}
```

---

## 3. SLA Card Route Navigation

`DashboardAlertCards` receives `onRouteSelect` as a prop — the component itself is unchanged. The behavior difference is entirely in what the caller passes:

| Context | `onRouteSelect` behavior |
|---|---|
| Dashboard | `router.push('/sla?alert=X&route=Y')` — navigate away |
| SLA page | `router.replace('?alert=X&route=Y')` — update in-place |

URL param keys:
- `alert`: one of `reservasiPenerbangan | potensiMelebihiSla | melewatiSla | potensiMelebihiTjph | melewatiTjph`
- `route`: route name string, URL-encoded

---

## 4. Odd/Even Row Colors (All Tables)

### Pattern (from PnL implementation)
```tsx
// On <tr> elements, keyed by row index (idx):
className={idx % 2 === 1 ? 'bg-muted/70' : ''}
```

Odd-indexed rows (1, 3, 5…) get `bg-muted/70`. Even rows (0, 2, 4…) are transparent. This matches the existing PnL drilldown table.

### Tables to Update

| Table | File |
|---|---|
| `AirShipmentTable` | `src/features/air-shipments/components/AirShipmentTable.tsx` |
| Users table | `src/features/settings/components/UsersTable.tsx` (or similar path) |
| Roles table | `src/features/settings/components/RolesTable.tsx` |
| Permissions table | `src/features/settings/components/PermissionsTable.tsx` |
| Invitations table | `src/features/settings/components/InvitationsTable.tsx` |
| Audit logs table | `src/features/audit/components/AuditTable.tsx` (or similar path) |

> Exact file paths to be confirmed during implementation via grep. PnL tables already have odd/even coloring — skip those.

### Existing hover style
All tables currently have `hover:bg-muted/30` on rows. Keep this — it still applies on hover and visually overrides the stripe on hover, which is the expected UX.

---

## 5. Sidebar Height Fix

### Problem
The sidebar wrapper in `dashboard-shell.tsx` lacks an explicit height, so when main content grows tall, the sidebar can stretch beyond the viewport or behave inconsistently.

### Fix in `dashboard-shell.tsx`

```diff
- <div className="flex min-h-screen">
+ <div className="flex h-screen overflow-hidden">

- <div className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0">
+ <div className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 h-full">
```

- `h-screen overflow-hidden` on root: locks the shell to exactly the viewport height; overflow is handled by each column independently
- `h-full` on sidebar wrapper: sidebar fills its parent column exactly
- Main content column already has `overflow-auto` on `<main>` — no change needed there

The sidebar's internal `overflow-y-auto` on the nav link section already handles overflow when there are many nav items.

---

## Approach Decision

**Approach A (URL-driven filters, shared components)** was chosen over:
- Approach B (extract shared component) — premature abstraction for 2 consumers
- Approach C (full duplicate) — creates ~400-line duplication

URL params are idiomatic in Next.js App Router and make filters bookmarkable/shareable.

---

## Files to Create
- `apps/frontend/src/app/(dashboard)/sla/page.tsx`
- `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

## Files to Modify
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` — remove table, change onRouteSelect
- `apps/frontend/src/components/layout/sidebar.tsx` — add SLA nav link
- `apps/frontend/src/components/layout/dashboard-shell.tsx` — sidebar height fix
- `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx` — odd/even rows
- Settings and audit table files (paths confirmed during implementation)
- `.gitignore` — add `.superpowers/` (already done)
