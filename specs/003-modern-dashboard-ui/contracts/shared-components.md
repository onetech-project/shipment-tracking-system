# Contract: Shared UI Components

**Feature**: `003-modern-dashboard-ui`  
**Type**: Internal Component API Contracts  
**Status**: Complete

These contracts define the TypeScript prop interfaces for every shared component introduced by
this feature. They form the stable interface between the shared component library
(`src/components/shared/` and `src/components/layout/`) and the feature-specific pages/components
that consume them.

All `data-testid` attributes from the existing codebase are preserved — see the testid inventory
at the bottom of this document.

---

## 1. Layout Components

### 1.1 `DashboardShell`

**File**: `src/components/layout/dashboard-shell.tsx`  
**Role**: Root layout Client Component — composes sidebar, mobile drawer, top bar, and main area.

```typescript
interface DashboardShellProps {
  children: React.ReactNode;
}
// No other props — sidebar open/close state is internal via useSidebar hook.
// Usage: <DashboardShell>{children}</DashboardShell>
```

### 1.2 `Sidebar`

**File**: `src/components/layout/sidebar.tsx`  
**Role**: Persistent desktop navigation — visible at `lg:` and wider.

```typescript
interface SidebarProps {
  // No external props — reads auth context internally (same as current navigation.tsx)
}
// Usage: <Sidebar />
// Internal: renders nav groups, applies role-based conditional sections,
//           bottom sign-out button.
```

### 1.3 `MobileDrawer`

**File**: `src/components/layout/mobile-drawer.tsx`  
**Role**: shadcn/ui Sheet-based slide-in navigation for mobile (`< lg`).

```typescript
interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}
// Usage: <MobileDrawer open={isOpen} onClose={close} />
// Internal: same navigation content as Sidebar; calls onClose on nav link click.
```

### 1.4 `TopBar`

**File**: `src/components/layout/top-bar.tsx`  
**Role**: Mobile-only top bar containing the hamburger toggle and app brand name.

```typescript
interface TopBarProps {
  onMenuToggle: () => void;
}
// Usage: <TopBar onMenuToggle={toggle} />
// Rendered only on mobile (lg:hidden wrapper in DashboardShell).
```

---

## 2. Shared UI Components

### 2.1 `DataTable<T>`

**File**: `src/components/shared/data-table.tsx`

```typescript
export interface DataTableColumn<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;       // applied to both <th> and <td>
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;       // default: "No records found."
  isLoading?: boolean;         // renders a skeleton loader row when true
  className?: string;          // applied to the outer scroll container <div>
  'data-testid'?: string;      // applied to the <table> element
  rowDataTestId?: string;      // applied to every <tr> in tbody
}
```

**Rendered structure**:
```html
<div class="overflow-x-auto rounded-md border">
  <table data-testid="{props['data-testid']}">
    <thead class="bg-muted/50">
      <tr>
        <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">…</th>
      </tr>
    </thead>
    <tbody>
      <tr data-testid="{rowDataTestId}" class="hover:bg-muted/30 transition-colors duration-150">
        <td class="px-4 py-3 text-sm">…</td>
      </tr>
      <!-- empty state when rows.length === 0 -->
      <tr>
        <td colspan="{columns.length}" class="px-4 py-8 text-center text-muted-foreground">
          {emptyMessage}
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

**Pages that consume DataTable**:
- `settings/users/page.tsx` — rowDataTestId not needed (no existing testid on user rows)
- `settings/roles/page.tsx`
- `settings/organizations/page.tsx`
- `settings/invitations/page.tsx`
- `settings/permissions/page.tsx`
- `audit/page.tsx`
- `shipments/history/page.tsx` — via `UploadHistory` component (`data-testid="history-row"` on rows, `data-testid="history-empty"` on empty state)

---

### 2.2 `ActionCard`

**File**: `src/components/shared/action-card.tsx`

```typescript
import type { LucideIcon } from 'lucide-react';

export interface ActionCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  'data-testid'?: string;
}
```

**Rendered structure**:
```html
<a href="{href}" class="group block rounded-lg border bg-card p-6 shadow-sm
                         motion-safe:transition-all motion-safe:duration-150
                         motion-safe:hover:shadow-md motion-safe:hover:-translate-y-0.5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
    <Icon class="h-5 w-5 text-primary" />
  </div>
  <h3 class="text-base font-semibold text-card-foreground">{title}</h3>
  <p class="mt-1 text-sm text-muted-foreground">{description}</p>
</a>
```

**Pages that consume ActionCard**: `dashboard/page.tsx` (3 cards)

---

### 2.3 `FormField`

**File**: `src/components/shared/form-field.tsx`

```typescript
export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  children: React.ReactElement; // the actual <Input>, <Select>, etc.
}
```

**Rendered structure**:
```html
<div class="flex flex-col gap-1.5">
  <label class="text-sm font-medium leading-none" for="{htmlFor}">
    {label}{required && <span class="text-destructive ml-0.5" aria-hidden="true">*</span>}
  </label>
  {children}                <!-- e.g., shadcn <Input> -->
  {hint && <p class="text-xs text-muted-foreground">{hint}</p>}
  {error && (
    <span class="flex items-center gap-1 text-sm text-destructive">
      <AlertCircle size={14} aria-hidden="true" />
      {error}
    </span>
  )}
</div>
```

**Feature components that consume FormField**:
- `app/(auth)/login/page.tsx` — username, password fields
- `features/users/components/user-edit-form.tsx` — name, position, employeeNumber, phoneNumber
- `features/organizations/components/organization-form.tsx` — name field
- `features/invitations/components/invitation-form.tsx` — username, email, role fields
- `features/permissions/components/permission-form.tsx` — permission name/key fields

---

### 2.4 `StatusBadge`

**File**: `src/components/shared/status-badge.tsx`

```typescript
export type StatusVariant = 'active' | 'inactive' | 'locked' | 'pending' | 'success' | 'error';

export interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;  // overrides the default capitalised variant name
  className?: string;
}
```

**Variant class mapping**:
```typescript
const variantClasses: Record<StatusVariant, string> = {
  active:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  locked:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pending:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  success:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  error:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
```

**Pages that consume StatusBadge**:
- `settings/users/page.tsx` — Active/Inactive + Locked variants
- `settings/organizations/page.tsx` — Active/Inactive
- `settings/invitations/page.tsx` — Pending/Active/Inactive

---

### 2.5 `ConfirmDialog`

**File**: `src/components/shared/confirm-dialog.tsx`

```typescript
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | React.ReactNode;
  confirmLabel?: string;    // default: "Confirm"
  cancelLabel?: string;     // default: "Cancel"
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;      // disables confirm button + shows spinner
  destructive?: boolean;    // renders confirm button as destructive variant (red)
}
```

**Built on**: `shadcn/ui Dialog` + `DialogHeader`, `DialogFooter`, `DialogTitle`,
`DialogDescription`.

**Animation contract** (FR-006):
```
open:  data-[state=open]:motion-safe:animate-in
       data-[state=open]:motion-safe:fade-in-0
       data-[state=open]:motion-safe:zoom-in-95
close: data-[state=closed]:motion-safe:animate-out
       data-[state=closed]:motion-safe:fade-out-0
       data-[state=closed]:motion-safe:zoom-out-95
```

**Feature components that consume ConfirmDialog**:
- `features/users/components/inactivate-user-dialog.tsx`
- `features/users/components/unlock-user-dialog.tsx`
- `features/organizations/components/deactivate-org-dialog.tsx`

---

### 2.6 `PageHeader`

**File**: `src/components/shared/page-header.tsx`

```typescript
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;  // e.g., an "Invite User" button — rendered right-aligned
  className?: string;
}
```

**Rendered structure**:
```html
<div class="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
    {subtitle && <p class="text-sm text-muted-foreground mt-1">{subtitle}</p>}
  </div>
  {action && <div class="mt-2 sm:mt-0">{action}</div>}
</div>
```

**Pages that consume PageHeader**: all 10 settings and dashboard sub-pages.

---

## 3. data-testid Preservation Contract

All `data-testid` attributes from the existing source code MUST be preserved on the
semantically equivalent element in the revamped component. No testid may be removed or renamed.

### 3.1 PdfUploader — `src/features/shipments/components/PdfUploader.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `file-type-error` | Error `<p>` | Preserved on the FormField error message span or a standalone `<p>` |
| `upload-submit` | Submit `<button>` | Preserved on shadcn `<Button type="submit">` via `data-testid` prop spread |

### 3.2 ImportStatus — `src/features/shipments/components/ImportStatus.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `import-status` | Status container | Preserved on outer `<div>` of the Card content |
| `rows-imported` | Count `<td>` | Preserved on the `<td>` element within the status table |

### 3.3 ConflictReview — `src/features/shipments/components/ConflictReview.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `conflict-review` | Container `<div>` | Preserved on the outer wrapper div |
| `conflict-row` | Each `<tr>` | Preserved via `rowDataTestId="conflict-row"` on DataTable OR directly on each `<tr>` |
| `conflict-action-overwrite` | Overwrite `<button>` | Preserved on shadcn `<Button>` via prop spread |
| `conflict-action-skip` | Skip `<button>` | Preserved on shadcn `<Button>` via prop spread |
| `resolve-conflicts-submit` | Submit `<button>` | Preserved on shadcn `<Button>` via prop spread |

### 3.4 UploadHistory — `src/features/shipments/components/UploadHistory.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `history-empty` | Empty state `<p>` | DataTable renders empty state with `data-testid="history-empty"` via the `emptyTestId` prop OR managed inline |
| `history-row` | Each history `<tr>` | Preserved via `rowDataTestId="history-row"` on DataTable |

### 3.5 QrScanner — `src/features/shipments/components/QrScanner.tsx`

All 9 testids (`start-scanner`, `permission-prompt`, `permission-denied`, `no-camera`,
`camera-in-use`, `scanner-status`, `shipment-not-found`, `invalid-qr-format`, `scan-error`)
are preserved on the same logical `<button>` and `<div>` elements — only surrounding
class names change from inline styles to Tailwind utilities.

### 3.6 ShipmentDetail — `src/features/shipments/components/ShipmentDetail.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `shipment-detail` | Detail container | Preserved on the outer `<div>` or `<Card>` root |

### 3.7 LinehaulDetail — `src/features/shipments/components/LinehaulDetail.tsx`

| testid | Element | Preservation strategy |
|--------|---------|----------------------|
| `linehaul-detail` | Container | Preserved on outer `<div>` |
| `linehaul-trip-header` | `<details>` element | Preserved on `<details>` (no change to element type) |
| `scan-again-button` | Button | Preserved on shadcn `<Button>` via prop spread |
