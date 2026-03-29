# Data Model: Modern Dashboard UI Revamp

**Feature**: `003-modern-dashboard-ui`  
**Phase**: 1 — Design  
**Status**: Complete

This document defines the **design system entities**, **component data shapes**, and
**state models** introduced by the UI revamp. No database schema or API response types
change — this model describes only the frontend rendering layer.

---

## 1. Design Tokens

The single source of truth for visual design. Defined in `src/app/globals.css` as CSS custom
properties and consumed by Tailwind CSS via the `hsl(var(--token))` pattern.

### 1.1 Color Palette

| Token | HSL Value | Semantic Meaning | Tailwind Usage |
|-------|-----------|-----------------|----------------|
| `--background` | `0 0% 100%` | Page / main area background | `bg-background` |
| `--foreground` | `222.2 84% 4.9%` | Default text | `text-foreground` |
| `--primary` | `221.2 83.2% 53.3%` | Primary action (blue-600) | `bg-primary`, `text-primary` |
| `--primary-foreground` | `210 40% 98%` | Text on primary bg | `text-primary-foreground` |
| `--secondary` | `210 40% 96.1%` | Secondary surfaces | `bg-secondary` |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | Text on secondary | `text-secondary-foreground` |
| `--muted` | `210 40% 96.1%` | Muted / subtle areas | `bg-muted`, `text-muted-foreground` |
| `--accent` | `210 40% 96.1%` | Hover accent | `bg-accent` |
| `--destructive` | `0 84.2% 60.2%` | Error / delete actions | `bg-destructive` |
| `--border` | `214.3 31.8% 91.4%` | Borders, dividers | `border-border` |
| `--input` | `214.3 31.8% 91.4%` | Input borders | `border-input` |
| `--ring` | `221.2 83.2% 53.3%` | Focus rings | `ring-ring` |
| `--card` | `0 0% 100%` | Card backgrounds | `bg-card` |
| `--card-foreground` | `222.2 84% 4.9%` | Text on cards | `text-card-foreground` |
| `--popover` | `0 0% 100%` | Popover / dropdown bg | `bg-popover` |
| `--sidebar-bg` | `222.2 47.4% 11.2%` | Sidebar background (slate-900) | Custom class |
| `--sidebar-fg` | `210 40% 98%` | Sidebar text | Custom class |
| `--sidebar-muted` | `215.4 16.3% 46.9%` | Sidebar section labels | Custom class |

### 1.2 Typography Scale (inherited from Tailwind defaults)

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-2xl font-bold` | 1.5 rem | 700 | Page `<h1>` titles |
| `text-xl font-semibold` | 1.25 rem | 600 | Card / section headings |
| `text-sm` | 0.875 rem | 400 | Body text, table cells |
| `text-xs uppercase tracking-wide` | 0.75 rem | 500 | Nav section labels |

### 1.3 Spacing & Border Radius

| Token | Value | Tailwind |
|-------|-------|---------|
| `--radius` | `0.5 rem` | `rounded-md` |
| Card padding | 1.5 rem | `p-6` |
| Section gap | 1.5 rem | `gap-6` |
| Sidebar width (desktop) | 15 rem (240 px) | `w-60` |

### 1.4 Animation Durations

| Token | Value | Usage |
|-------|-------|-------|
| `duration-150` | 150 ms | Button hover shadow, row hover |
| `duration-200` | 200 ms | Modal fade-in/out |
| `duration-300` | 300 ms | Sheet drawer slide-in |

---

## 2. Component State Models

### 2.1 Sidebar State (`useSidebar` hook)

```typescript
// src/components/layout/sidebar.tsx (or a co-located hook)
interface SidebarState {
  isOpen: boolean;       // mobile drawer open/closed
  toggle: () => void;    // flip isOpen
  close: () => void;     // always close (called on nav link click)
}
```

**Lifecycle**:
- `isOpen` starts `false` on every page load.
- Toggled by the hamburger `<button>` in `TopBar`.
- Force-closed by every `<NavLink>` `onClick` handler in `MobileDrawer`.
- On viewport resize crossing 1024 px: `isOpen` is irrelevant on desktop since the Sheet
  is not rendered (`lg:hidden` wrapping).
- On device rotation: `isOpen` may remain `true`; a `useEffect` listening to a `lg` media
  query should call `close()` when the viewport widens to desktop.

### 2.2 ActionCard Data Shape

```typescript
// src/components/shared/action-card.tsx
interface ActionCardProps {
  href: string;           // next/link destination
  icon: React.ComponentType<{ className?: string }>; // Lucide icon
  title: string;
  description: string;
  'data-testid'?: string;
}
```

**Dashboard instances** (from FR-009):

| Title | href | Icon |
|-------|------|------|
| Upload Shipments | `/shipments/upload` | `Upload` |
| Upload History | `/shipments/history` | `History` |
| QR Scan | `/shipments/scan` | `QrCode` |

### 2.3 DataTable Data Shape

```typescript
// src/components/shared/data-table.tsx
interface DataTableProps<T> {
  columns: {
    header: string;
    accessor: (row: T) => React.ReactNode;
    className?: string;
  }[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;          // defaults to "No records found."
  'data-testid'?: string;         // applied to the <table> element
  rowTestId?: string;             // applied to each <tr> (e.g., "history-row")
}
```

### 2.4 FormField Data Shape

```typescript
// src/components/shared/form-field.tsx
// Thin wrapper — keeps react-hook-form integration inside feature components
interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactElement; // <Input>, <Select>, <Textarea>, etc.
  required?: boolean;
  hint?: string;
}
```

**Validation error display rule** (FR-011): always renders as
`<span className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14}/> {error}</span>`.

### 2.5 StatusBadge Variants

```typescript
// src/components/shared/status-badge.tsx
type StatusVariant = 'active' | 'inactive' | 'locked' | 'pending' | 'success' | 'error';

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;   // defaults to capitalised variant name
}
```

| Variant | Tailwind classes |
|---------|-----------------|
| `active` | `bg-green-100 text-green-800` |
| `inactive` | `bg-red-100 text-red-700` |
| `locked` | `bg-amber-100 text-amber-800` |
| `pending` | `bg-blue-100 text-blue-700` |
| `success` | `bg-green-100 text-green-800` |
| `error` | `bg-red-100 text-red-700` |

### 2.6 ConfirmDialog Data Shape

```typescript
// src/components/shared/confirm-dialog.tsx
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;         // defaults to "Confirm"
  cancelLabel?: string;          // defaults to "Cancel"
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;         // renders confirm button with destructive variant
}
```

### 2.7 PageHeader Data Shape

```typescript
// src/components/shared/page-header.tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;   // optional right-side action button slot
}
```

---

## 3. Layout Composition Model

```
DashboardLayout (Server Component — layout.tsx)
  └── DashboardShell (Client Component — dashboard-shell.tsx)
        ├── Sidebar (Client Component — sidebar.tsx)      [desktop: lg:flex, hidden on mobile]
        ├── MobileDrawer (Client Component — mobile-drawer.tsx) [Sheet, lg:hidden]
        ├── TopBar (Client Component — top-bar.tsx)        [mobile: flex, lg:hidden]
        └── <main> content area
              └── {children}  ← page components
```

**Auth guard**: Remains in `layout.tsx` (existing `useAuth` + `useRouter` redirect logic).
The `DashboardShell` Client Component is rendered only after the auth check passes —
identical to the current behaviour.

---

## 4. State Transitions

### 4.1 Mobile Navigation State Machine

```
[CLOSED] --[hamburger click]--> [OPEN]
[OPEN]   --[nav link click]---> [CLOSED]
[OPEN]   --[Escape key]-------> [CLOSED]
[OPEN]   --[backdrop click]---> [CLOSED]
[OPEN]   --[viewport >= 1024px]--> [CLOSED, drawer unmounted]
```

### 4.2 Modal State Machine (generic — applies to all Dialog/ConfirmDialog instances)

```
[CLOSED] --[trigger click]--> [ANIMATING_IN] --[animation end]--> [OPEN]
[OPEN]   --[close trigger]--> [ANIMATING_OUT]--> [CLOSED]
```

Animation: `fade-in-0 zoom-in-95` on open; `fade-out-0 zoom-out-95` on close.
When `prefers-reduced-motion: reduce` → animation classes are suppressed via `motion-safe:`.

---

## 5. Entity Relationships

```
AuthUser (existing, unchanged)
  ├── id, username, organizationId, isSuperAdmin, roles[]
  └── consumed by:
        ├── DashboardHomePage → welcome card (user.username, user.roles)
        ├── Sidebar → avatar display (user.username initials)
        └── Navigation → conditional sections (user.isSuperAdmin, isAdminOrAbove)

SidebarState (UI-only, ephemeral)
  └── owned by DashboardShell, passed to TopBar + MobileDrawer

DataTableProps<T> (generic, per-page)
  └── instantiated by each settings/history page with page-specific column definition
```

---

## 6. Validation Rules (from spec)

| Rule | FR Ref | Implementation |
|------|--------|---------------|
| No inline `style` props on revamped components | FR-002 | ESLint rule `react/forbid-component-props` on `style` (optional; enforced by code review) |
| `data-testid` preserved on all elements | Assumption | Documented in research R-007 testid inventory |
| All `data-testid` values preserved | SC-003 | Playwright CI gate |
| Animations suppressed with reduce-motion | FR-007 | `motion-safe:` prefix on all transition classes |
| Forms continue to use `react-hook-form` + `zod` | FR-001, FR-012 | No changes to form submit handlers or validation schemas |
