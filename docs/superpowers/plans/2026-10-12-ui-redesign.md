# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `apps/frontend` to the green design system in `app-unified.html` (spec: `docs/superpowers/specs/2026-10-12-ui-redesign-design.md`).

**Architecture:** Remap shadcn HSL tokens and add semantic Tailwind colours, then restyle the shell and the shared primitives (cva) so every page inherits the look; finally polish each feature area by replacing hardcoded palette classes with semantic tokens and adopting the new primitives.

**Tech Stack:** Next.js 14 app router, Tailwind 3.4, shadcn/ui (Radix + cva), lucide-react, recharts, jest + Testing Library.

## Global Constraints

- Frontend only. No API, data, routing, permission or copy changes.
- Keep every existing `data-testid`, handler, prop and visible text.
- No dark mode; remove `.dark`.
- Icons: lucide-react only (no emoji).
- Fonts: Inter (body) + Space Grotesk (display/numbers) via `next/font/google`.
- Run commands from `apps/frontend`. Jest: `NODE_OPTIONS=--max-old-space-size=4096 npx jest --maxWorkers=2`.
- Commit author: `git -c user.name=faris -c user.email=putra.faris295@gmail.com commit`, message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Baseline before work: `pnpm type-check` exit 0, jest 117 suites / 1429 tests passing.

## Token reference (used by every task)

| Meaning | Class |
|---|---|
| Primary action / selected | `bg-primary` `text-primary` (= `#3dae68`), hover `bg-brand-hover` |
| Brand accents | `brand` `brand-2` `brand-ink` `brand-soft` `brand-light` `brand-line` |
| Positive / success / profit | `text-good` `bg-good-soft` `text-brand-ink` |
| Warning / pending / estimated | `text-warn` `bg-warn-soft` `text-warn-ink` `border-warn/30` |
| Negative / error / breach | `text-bad` `bg-bad-soft` `text-bad-ink` `bg-bad-strong` `border-bad/25` |
| Info / neutral highlight | `text-info` `bg-info-soft` `text-info-ink` `border-info/25` |
| Neutral surfaces | `bg-surface-2` `bg-surface-3` `bg-table-head` `hover:bg-row-hover` |
| Neutral text | `text-foreground` `text-muted-foreground` `text-faint` |
| Lines | `border-border` `border-border-strong` |
| Chart palette | `#3dae68 #4fc87b #7ddba0 #1f2a22 #2d7a4a #0e7490 #ca8a04 #dc2626 #556655` (exported as `CHART_COLORS` from `src/lib/chart-colors.ts`) |

Palette mapping for polish tasks (apply literally; shade picks the role):

| Old | New |
|---|---|
| `*-green-*` / `*-emerald-*` 50–100 bg | `bg-good-soft` |
| green/emerald 500–600 text/bg/fill | `text-good` / `bg-good` |
| green/emerald 700–900 text | `text-brand-ink` |
| green/emerald 200–300 border | `border-brand-line` |
| red/rose 50–100 bg | `bg-bad-soft` |
| red/rose 500–600 | `text-bad-strong` / `bg-bad-strong` |
| red/rose 700–900 text | `text-bad` (700) / `text-bad-ink` (800–900) |
| red/rose 200–300 border | `border-bad/25` |
| amber/yellow/orange 50–100 bg | `bg-warn-soft` |
| amber/yellow/orange 400–600 | `text-warn` / `bg-warn` |
| amber/yellow/orange 700–900 text | `text-warn-ink` |
| amber/yellow/orange 200–300 border | `border-warn/30` |
| blue/indigo/sky/cyan 50–100 bg | `bg-info-soft` (or `bg-brand-soft` when it marks "selected/primary") |
| blue/indigo/sky/cyan 500–600 | `text-info` / `bg-info` (or `primary` when it is the primary action) |
| blue/indigo/sky/cyan 700–900 text | `text-info-ink` |
| blue/indigo/sky/cyan 200–300 border | `border-info/25` |
| slate/gray/zinc 50–100 bg | `bg-surface-2` |
| slate/gray/zinc 200–300 border | `border-border` / `border-border-strong` |
| slate/gray/zinc 400 text | `text-faint` |
| slate/gray/zinc 500–600 text | `text-muted-foreground` |
| slate/gray/zinc 700–900 text | `text-foreground` |
| purple/violet/teal/pink categorical | nearest chart-palette colour via arbitrary value or `CHART_COLORS` |

Opacity modifiers carry over (`bg-red-50/60` → `bg-bad-soft/60`). Hover/focus variants carry over.

---

## Phase 1 — Foundation

### Task 1: Tokens, fonts, base styles

**Files:**
- Modify: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`
- Create: `src/lib/chart-colors.ts`

- [ ] **Step 1: Replace `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background:             120 23% 97.5%;   /* #f7faf7 */
    --foreground:             120 27% 8%;      /* #0f1a0f */
    --card:                   0 0% 100%;
    --card-foreground:        120 27% 8%;
    --popover:                0 0% 100%;
    --popover-foreground:     120 27% 8%;
    --primary:                143 48% 46%;     /* #3dae68 */
    --primary-foreground:     0 0% 100%;
    --secondary:              120 14% 96%;     /* #f3f6f3 */
    --secondary-foreground:   120 27% 8%;
    --muted:                  120 14% 96%;
    --muted-foreground:       120 9% 37%;      /* #556655 */
    --accent:                 120 14% 96%;
    --accent-foreground:      120 27% 8%;
    --destructive:            0 74% 42%;       /* #b91c1c */
    --destructive-foreground: 0 0% 100%;
    --border:                 120 18% 90%;     /* #e2ebe2 */
    --input:                  120 18% 90%;
    --ring:                   142 52% 55%;     /* #4fc87b */
    --radius:                 0.875rem;
    --sidebar-bg:             120 15% 9%;      /* #141b14 */
    --sidebar-fg:             120 10% 79%;     /* #c5d0c5 */
    --sidebar-muted:          120 10% 47%;     /* #6c856c */
  }

  * {
    @apply border-border;
    box-sizing: border-box;
  }

  html { -webkit-font-smoothing: antialiased; }

  body {
    @apply bg-background text-foreground font-sans;
    font-size: 14px;
    line-height: 1.55;
  }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #cfd9cf; border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: #a4b4a4; background-clip: content-box; }
}

@layer utilities {
  .tabular { font-variant-numeric: tabular-nums; }
}
```

- [ ] **Step 2: Extend `tailwind.config.ts`** — keep existing keys, add inside `theme.extend`:

```ts
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'Space Grotesk', 'var(--font-sans)', 'sans-serif'],
      },
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(15,30,20,.05), 0 1px 2px rgba(15,30,20,.04)',
        'soft-md': '0 2px 8px rgba(15,30,20,.06)',
      },
```

and inside `theme.extend.colors` add:

```ts
        brand: {
          DEFAULT: '#4fc87b',
          2: '#3dae68',
          hover: '#2d8f54',
          ink: '#1f5a35',
          soft: '#e2f5e9',
          light: '#7ddba0',
          line: '#c6ead3',
        },
        ink: { DEFAULT: '#141c17', 2: '#1f2a22' },
        surface: { 2: '#f3f6f3', 3: '#fafcfa' },
        'table-head': '#f5f8f5',
        'row-hover': '#f8fcf9',
        'border-strong': '#cdd9cd',
        faint: '#8a9a8a',
        good: { DEFAULT: '#3dae68', soft: '#e2f5e9' },
        warn: { DEFAULT: '#ca8a04', soft: '#fef9c3', ink: '#713f12' },
        bad: { DEFAULT: '#b91c1c', soft: '#fee2e2', ink: '#7f1d1d', strong: '#dc2626' },
        info: { DEFAULT: '#0e7490', soft: '#cffafe', ink: '#0c4a6e' },
```

Change `borderRadius` to:

```ts
      borderRadius: {
        lg: 'var(--radius)',              // 14px — cards, dialogs
        md: 'calc(var(--radius) - 4px)',  // 10px
        sm: 'calc(var(--radius) - 6px)',  // 8px — controls
      },
```

Add `keyframes.pulse-soft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.5' } }` and `animation['pulse-soft']: 'pulse-soft 2s infinite'`.

- [ ] **Step 3: Fonts in `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { AuthProvider } from '@/features/auth/auth.context';
import { QueryProvider } from '@/shared/providers/query-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'Shipment Tracker — Eka Satya Puspita',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Create `src/lib/chart-colors.ts`**

```ts
// Chart palette from app-unified.html, in the order series should take it.
export const CHART_COLORS = [
  '#3dae68', '#4fc87b', '#7ddba0', '#1f2a22', '#2d7a4a', '#0e7490', '#ca8a04', '#dc2626', '#556655',
] as const;

export const CHART_STATUS = {
  good: '#3dae68',
  mid: '#7ddba0',
  bad: '#dc2626',
  warn: '#ca8a04',
  info: '#0e7490',
  neutral: '#556655',
  grid: '#e2ebe2',
  axis: '#8a9a8a',
} as const;
```

- [ ] **Step 5: Verify** `pnpm type-check` → exit 0. `pnpm build` is not required here (fonts are fetched at build; dev server is enough).
- [ ] **Step 6: Commit** `feat(ui): green design tokens, Inter + Space Grotesk, base styles`

### Task 2: Shell — sidebar, top bar, drawer, main, PageHeader, header badges

**Files:**
- Modify: `src/components/layout/sidebar.tsx`, `top-bar.tsx`, `mobile-drawer.tsx`, `dashboard-shell.tsx`, `src/components/shared/page-header.tsx`
- Create: `src/components/shared/header-badges.tsx`, `src/components/shared/brand-logo.tsx`
- Test: `src/components/shared/page-header.spec.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, subtitle?, action?, badge?, className? })`; `StagingBadge()`, `LiveBadge({ children? })`; `BrandLogo({ size?: 'sm' | 'md' })`; `NavLink` gains `badge?: string`.

- [ ] **Step 1: Failing test `page-header.spec.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PageHeader } from './page-header';
import { LiveBadge, StagingBadge } from './header-badges';

describe('PageHeader', () => {
  it('renders title as h1 in the display font', () => {
    render(<PageHeader title="P&L Analysis" subtitle="Ringkasan" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'P&L Analysis' });
    expect(h1).toHaveClass('font-display');
    expect(screen.getByText('Ringkasan')).toBeInTheDocument();
  });

  it('renders a badge next to the title and actions on the right', () => {
    render(<PageHeader title="SLA" badge={<StagingBadge />} action={<button>Export</button>} />);
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('LiveBadge defaults its label to Live', () => {
    render(<LiveBadge />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
```

Run `npx jest src/components/shared/page-header.spec.tsx` → FAIL (module `./header-badges` missing).

- [ ] **Step 2: `header-badges.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function StagingBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.08em] text-warn-ink', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
      Staging
    </span>
  );
}

export function LiveBadge({ children = 'Live', className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink', className)}>
      <span className="h-[7px] w-[7px] rounded-full bg-brand-2 motion-safe:animate-pulse-soft" aria-hidden="true" />
      {children}
    </span>
  );
}
```

- [ ] **Step 3: `page-header.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, badge, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="mb-1 flex flex-wrap items-center gap-2.5 font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
          {title}
          {badge}
        </h1>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2.5">{action}</div>}
    </div>
  );
}
```

(`subtitle` widens from `string` to `ReactNode` — still accepts strings.)

- [ ] **Step 4: `brand-logo.tsx`**

```tsx
import { cn } from '@/lib/utils';

export function BrandLogo({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] bg-brand font-extrabold tracking-[0.02em] text-white',
        size === 'md' ? 'h-[42px] w-[42px] text-xs' : 'h-8 w-8 text-[10px]',
        className,
      )}
    >
      ESP
    </span>
  );
}
```

- [ ] **Step 5: Sidebar restyle.** In `sidebar.tsx`:
  - `NavLink` gets `badge?: string`; classes:
    ```tsx
    className={cn(
      'relative flex items-center rounded-[9px] py-[9px] text-[13px] font-medium motion-safe:transition-colors',
      collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
      isActive ? 'bg-brand/[.18] text-white' : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
    )}
    ```
    and inside, before the icon: `{isActive && !collapsed && <span aria-hidden="true" className="absolute -left-3.5 top-2.5 bottom-2.5 w-[3px] rounded-r-[3px] bg-brand" />}`; icon wrapper `inline-flex w-[18px] shrink-0 justify-center opacity-90`; after label `{badge && !collapsed && <span className="ml-auto rounded-full bg-brand/[.18] px-1.5 py-0.5 text-[10px] font-semibold text-[#a6e5c0]">{badge}</span>}`.
  - `nav` root: `flex h-full w-full flex-col overflow-hidden border-r border-white/[.06] bg-sidebar px-3.5 py-[22px] text-sidebar-foreground`.
  - Header block replaced by:
    ```tsx
    <div className={cn('mb-4 flex items-center gap-2.5', collapsed ? 'flex-col' : 'px-1.5')}>
      <BrandLogo size={collapsed ? 'sm' : 'md'} />
      {!collapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-bold tracking-[-0.01em] text-white">Shipment Tracker</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#88a088]">Eka Satya Puspita</div>
        </div>
      )}
      {onToggleCollapse && (
        <button type="button" onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 rounded-md p-1 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white">
          <Menu size={16} />
        </button>
      )}
    </div>
    ```
    and the first `<Separator>` is removed.
  - Section labels: `px-2.5 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-sidebar-muted` (drop the `mt-4` wrapper margin; the label padding provides it).
  - SLA link: `badge="LIVE"`.
  - Sign-out button: `text-sidebar-foreground hover:bg-white/5 hover:text-white`.
- [ ] **Step 6: `mobile-drawer.tsx`** `SheetContent` className → `w-[248px] p-0 bg-sidebar border-0`.
- [ ] **Step 7: `top-bar.tsx`** header → `flex h-14 w-full items-center gap-3 border-b bg-card px-4`, replace the plain span with `<BrandLogo size="sm" /><span className="font-display text-sm font-bold">Shipment Tracker</span>`.
- [ ] **Step 8: `dashboard-shell.tsx`** desktop widths `lg:w-14` / `lg:w-[248px]`; main:
  ```tsx
  <main className="flex-1 overflow-auto px-4 py-4 lg:px-8 lg:pb-14 lg:pt-[26px]">
    <div className="mx-auto w-full max-w-[1700px]">{children}</div>
  </main>
  ```
- [ ] **Step 9:** `npx jest src/components/shared src/components/layout src/app/\(dashboard\)/fleet` → PASS; `pnpm type-check` → 0.
- [ ] **Step 10: Commit** `feat(ui): green sidebar shell, page header with badges`

### Task 3: Restyle existing primitives

**Files:**
- Modify: `src/components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `src/components/shared/status-badge.tsx`, `form-field.tsx`, `action-card.tsx`
- Create: `src/components/shared/icon-square.tsx`
- Test: `src/components/ui/primitives.spec.tsx`

**Interfaces:**
- Produces:
  - `IconSquare({ icon: LucideIcon, tone?: IconTone, size?: 'sm'|'md' })`, `type IconTone = 'brand'|'alt'|'light'|'dark'|'info'|'warn'|'danger'|'muted'`, `iconToneClass: Record<IconTone,string>`.
  - `CardHead({ icon?, tone?, title, subtitle?, actions?, className? })`; `Card` gains `interactive?: boolean`.
  - Button variants `default|destructive|outline|secondary|ghost|link|subtle|danger-soft|ghost-dark`; sizes `default|sm|lg|icon`.
  - Badge variants `default|secondary|destructive|outline|active|inactive|pending|danger|info|neutral`.

- [ ] **Step 1: Failing test `primitives.spec.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Plane } from 'lucide-react';
import { Button } from './button';
import { Badge } from './badge';
import { Card, CardHead } from './card';
import { StatusBadge } from '@/components/shared/status-badge';

describe('design primitives', () => {
  it('Button subtle and danger-soft variants', () => {
    render(<><Button variant="subtle">A</Button><Button variant="danger-soft">B</Button></>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-surface-2');
    expect(screen.getByRole('button', { name: 'B' })).toHaveClass('bg-bad-soft');
  });

  it('Badge status variants', () => {
    render(<><Badge variant="active">on</Badge><Badge variant="pending">wait</Badge></>);
    expect(screen.getByText('on')).toHaveClass('bg-good-soft');
    expect(screen.getByText('wait')).toHaveClass('bg-warn-soft');
  });

  it('StatusBadge maps onto token classes', () => {
    render(<StatusBadge variant="locked" />);
    expect(screen.getByText('Locked')).toHaveClass('bg-bad-soft');
  });

  it('CardHead renders title, subtitle and a toned icon', () => {
    render(<Card><CardHead icon={Plane} tone="info" title="Shipments" subtitle="Hari ini" /></Card>);
    expect(screen.getByRole('heading', { level: 2, name: 'Shipments' })).toHaveClass('font-display');
    expect(screen.getByText('Hari ini')).toBeInTheDocument();
    expect(screen.getByTestId('icon-square')).toHaveClass('bg-info');
  });
});
```

Run → FAIL.

- [ ] **Step 2: `icon-square.tsx`**

```tsx
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IconTone = 'brand' | 'alt' | 'light' | 'dark' | 'info' | 'warn' | 'danger' | 'muted';

export const iconToneClass: Record<IconTone, string> = {
  brand: 'bg-brand-2 text-white',
  alt: 'bg-brand text-white',
  light: 'bg-brand-light text-brand-ink',
  dark: 'bg-ink-2 text-brand-light',
  info: 'bg-info text-white',
  warn: 'bg-warn text-white',
  danger: 'bg-bad-strong text-white',
  muted: 'bg-muted-foreground text-white',
};

export function IconSquare({ icon: Icon, tone = 'brand', size = 'sm', className }: {
  icon: LucideIcon; tone?: IconTone; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <span
      data-testid="icon-square"
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'sm' ? 'h-7 w-7 rounded-[7px]' : 'h-8 w-8 rounded-sm',
        iconToneClass[tone],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
```

- [ ] **Step 3: `card.tsx`** — full file:

```tsx
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconSquare, type IconTone } from '@/components/shared/icon-square';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> { interactive?: boolean }

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-card text-card-foreground',
        interactive && 'motion-safe:transition-shadow hover:shadow-soft-md',
        className,
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 px-[18px] py-3.5', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display text-sm font-bold leading-snug tracking-[-0.01em]', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs font-medium text-faint', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-[18px] pb-4 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center px-[18px] pb-4 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export interface CardHeadProps {
  icon?: LucideIcon;
  tone?: IconTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

// The mockup's `.card-head`: icon square + display title + faint subtitle, actions on the right,
// a border underneath. Pair it with a CardContent that sets its own top padding (`pt-4`).
function CardHead({ icon, tone = 'brand', title, subtitle, actions, className }: CardHeadProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-[18px] py-3.5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconSquare icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-bold tracking-[-0.01em]">{title}</h2>
          {subtitle && <div className="text-xs font-medium text-faint">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardHead };
```

- [ ] **Step 4: `button.tsx`** — replace `buttonVariants`:

```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-sm text-[13px] font-medium ring-offset-background motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border border-primary bg-primary font-semibold text-primary-foreground hover:border-brand-hover hover:bg-brand-hover',
        destructive: 'bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card text-foreground hover:border-border-strong hover:bg-surface-2',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[#e3ede3]',
        ghost: 'hover:bg-surface-2 hover:text-foreground',
        link: 'text-brand-2 underline-offset-4 hover:text-brand-ink hover:underline',
        subtle: 'border border-transparent bg-surface-2 text-muted-foreground hover:bg-[#e3ede3] hover:text-foreground',
        'danger-soft': 'border border-[#fecaca] bg-bad-soft text-bad hover:bg-[#fecaca]',
        'ghost-dark': 'border border-white/15 bg-white/10 text-white hover:bg-white/[.18]',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
```

- [ ] **Step 5: `badge.tsx`** — replace `badgeVariants`:

```ts
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        active: 'border-transparent bg-good-soft uppercase tracking-[0.04em] text-brand-ink',
        inactive: 'border-transparent bg-surface-2 uppercase tracking-[0.04em] text-faint',
        pending: 'border-transparent bg-warn-soft uppercase tracking-[0.04em] text-warn-ink',
        danger: 'border-transparent bg-bad-soft uppercase tracking-[0.04em] text-bad-ink',
        info: 'border-transparent bg-info-soft uppercase tracking-[0.04em] text-info-ink',
        neutral: 'border-border bg-surface-2 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);
```

- [ ] **Step 6: `status-badge.tsx`**

```tsx
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusVariant = 'active' | 'inactive' | 'locked' | 'pending' | 'success' | 'error';

const variantMap: Record<StatusVariant, NonNullable<BadgeProps['variant']>> = {
  active: 'active',
  inactive: 'inactive',
  locked: 'danger',
  pending: 'pending',
  success: 'active',
  error: 'danger',
};

export interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  return <Badge variant={variantMap[variant]} className={cn(className)}>{displayLabel}</Badge>;
}
```

(`pending` was blue; the mockup's pending is amber — intentional.)

- [ ] **Step 7: `input.tsx`** className →
`'flex h-8 w-full rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:font-normal placeholder:text-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50'`

- [ ] **Step 8: `label.tsx`** cva base → `'text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70'`. `form-field.tsx` label class → `'flex items-center gap-1 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] text-muted-foreground'`; required star keeps `text-destructive`; error line `text-xs`.
- [ ] **Step 9: Overlays.** `dialog.tsx`: overlay `bg-ink/60`; content `bg-card ... shadow-soft-md sm:rounded-lg` (replace `bg-background` and `shadow-lg`); `DialogTitle` class → `font-display text-base font-bold tracking-[-0.01em]`. `sheet.tsx`: overlay `bg-ink/60`, content `bg-card`. `dropdown-menu.tsx`: content `rounded-md border bg-popover shadow-soft-md`, item focus `focus:bg-surface-2`.
- [ ] **Step 10: `action-card.tsx`** container `'group block rounded-lg border bg-card p-[18px]'` + existing motion classes with `hover:shadow-soft-md`; icon box → `<IconSquare icon={Icon} size="md" />` with `mb-3`; title `font-display text-sm font-bold`; description `text-[12.5px] text-muted-foreground`.
- [ ] **Step 11:** `npx jest src/components` → PASS; full jest → fix only class assertions that reference replaced classes (expected: `StatusBadge` users asserting `bg-green-100`/`bg-blue-100`); `pnpm type-check` → 0.
- [ ] **Step 12: Commit** `feat(ui): restyle card, button, badge, input and overlays to the green system`

### Task 4: New primitives — Table, Tabs, KPI, Banner, EmptyState, PeriodChip, FilterBar

**Files:**
- Create: `src/components/ui/table.tsx`, `src/components/ui/segmented.tsx`, `src/components/shared/kpi-card.tsx`, `banner.tsx`, `empty-state.tsx`, `period-chip.tsx`, `filter-bar.tsx`
- Modify: `src/components/shared/data-table.tsx`
- Test: `src/components/ui/table.spec.tsx`, `src/components/ui/segmented.spec.tsx`, `src/components/shared/kpi-card.spec.tsx`

**Interfaces (produces):**
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead` (`num?: boolean`), `TableCell` (`num?: boolean`), `TableWrap` (rounded bordered scroller). Plain element props otherwise.
- `ModeTabs<T extends string>({ value: T, onValueChange(v: T), items: { value: T; label: ReactNode; icon?: LucideIcon; count?: number }[], className?, 'aria-label'? })`; `SubTabs` same signature.
- `KpiCard({ label, value, hint?, delta?: { dir: 'up'|'down'; text: string }, icon?: LucideIcon, tone?: IconTone, muted?: boolean, onClick?, className?, 'data-testid'? })`; `KpiGrid({ cols?: 3|4|5|6, className?, children })`; `MiniKpi({ label, value, sub?, className? })`.
- `Banner({ tone: 'warn'|'danger'|'info'|'success', title?, children, icon?: LucideIcon, className? })`.
- `EmptyState({ icon?: LucideIcon, title, message?, action?, className? })`.
- `PeriodChip({ children, className? })`.
- `FilterBar({ children, className? })`.

- [ ] **Step 1: Failing tests**

`table.spec.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

it('styles header cells and right-aligns numeric cells', () => {
  render(
    <Table>
      <TableHeader><TableRow><TableHead>Rute</TableHead><TableHead num>GP</TableHead></TableRow></TableHeader>
      <TableBody><TableRow><TableCell>CGK</TableCell><TableCell num>1.000</TableCell></TableRow></TableBody>
    </Table>
  );
  expect(screen.getByRole('columnheader', { name: 'Rute' })).toHaveClass('uppercase', 'bg-table-head');
  expect(screen.getByRole('columnheader', { name: 'GP' })).toHaveClass('text-right');
  expect(screen.getByRole('cell', { name: '1.000' })).toHaveClass('text-right', 'tabular');
});
```

`segmented.spec.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ModeTabs, SubTabs } from './segmented';

const items = [{ value: 'air', label: 'Air' }, { value: 'sea', label: 'Sea' }] as const;

it('ModeTabs marks the active tab and reports changes', async () => {
  const onChange = jest.fn();
  render(<ModeTabs aria-label="Mode" value="air" onValueChange={onChange} items={[...items]} />);
  expect(screen.getByRole('tablist', { name: 'Mode' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Air' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.click(screen.getByRole('tab', { name: 'Sea' }));
  expect(onChange).toHaveBeenCalledWith('sea');
});

it('SubTabs uses the brand-ink active chip', () => {
  render(<SubTabs value="sea" onValueChange={() => {}} items={[...items]} />);
  expect(screen.getByRole('tab', { name: 'Sea' })).toHaveClass('bg-brand-ink');
});
```

`kpi-card.spec.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Wallet } from 'lucide-react';
import { KpiCard, KpiGrid } from './kpi-card';

it('renders label, value, hint and an up delta', () => {
  render(<KpiGrid cols={4}><KpiCard label="Revenue" value="Rp 6,13 M" hint="vs lalu" delta={{ dir: 'up', text: '8.2%' }} icon={Wallet} /></KpiGrid>);
  expect(screen.getByText('Revenue')).toBeInTheDocument();
  expect(screen.getByText('Rp 6,13 M')).toHaveClass('font-display', 'tabular');
  expect(screen.getByText(/8\.2%/)).toHaveClass('bg-good-soft');
});

it('is a button when clickable', () => {
  render(<KpiCard label="Breach" value="3" onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /breach/i })).toBeInTheDocument();
});
```

Run → FAIL.

- [ ] **Step 2: `table.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const TableWrap = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('overflow-x-auto rounded-md border bg-card', className)} {...props} />
  )
);
TableWrap.displayName = 'TableWrap';

const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full border-collapse text-[12.5px]', className)} {...props} />
  )
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn(className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child>td]:border-b-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('motion-safe:transition-colors [tbody_&]:hover:bg-row-hover', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

interface CellProps { num?: boolean }

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, num, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'sticky top-0 whitespace-nowrap border-b bg-table-head px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground first:pl-3.5',
        num && 'text-right',
        className,
      )}
      {...props}
    />
  )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, num, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('border-b px-2.5 py-[9px] text-xs text-foreground first:pl-3.5', num && 'tabular text-right', className)}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

export { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 3: `segmented.tsx`**

```tsx
'use client';
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
  'data-testid'?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: SegmentedItem<T>[];
  className?: string;
  'aria-label'?: string;
}

function makeTabs(styles: { list: string; tab: string; active: string; idle: string }) {
  return function Tabs<T extends string>({ value, onValueChange, items, className, 'aria-label': ariaLabel }: SegmentedProps<T>) {
    return (
      <div role="tablist" aria-label={ariaLabel} className={cn(styles.list, className)}>
        {items.map((item) => {
          const active = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              data-testid={item['data-testid']}
              onClick={() => onValueChange(item.value)}
              className={cn(styles.tab, active ? styles.active : styles.idle, 'disabled:cursor-not-allowed disabled:opacity-50')}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {item.label}
              {item.count !== undefined && <span className="tabular text-[10.5px] opacity-70">{item.count}</span>}
            </button>
          );
        })}
      </div>
    );
  };
}

// `.mode-tabs` in the mockup: grey track, active tab lifts to white.
export const ModeTabs = makeTabs({
  list: 'inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1',
  tab: 'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
  active: 'bg-card font-semibold text-foreground shadow-soft-sm',
  idle: 'text-muted-foreground hover:text-foreground',
});

// `.sub-tabs` in the mockup: bordered chips, active chip filled with brand-ink.
export const SubTabs = makeTabs({
  list: 'flex flex-wrap gap-1',
  tab: 'inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-[11.5px] font-medium motion-safe:transition-all',
  active: 'border-brand-ink bg-brand-ink font-semibold text-white',
  idle: 'border-border bg-card text-muted-foreground hover:border-brand hover:text-brand-ink',
});
```

- [ ] **Step 4: `kpi-card.tsx`**

```tsx
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconSquare, type IconTone } from './icon-square';

const gridCols = {
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-6',
} as const;

export function KpiGrid({ cols = 4, className, children }: { cols?: keyof typeof gridCols; className?: string; children: React.ReactNode }) {
  return <div className={cn('mb-[18px] grid gap-3', gridCols[cols], className)}>{children}</div>;
}

export interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { dir: 'up' | 'down'; text: string };
  icon?: LucideIcon;
  tone?: IconTone;
  muted?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function KpiCard({ label, value, hint, delta, icon, tone = 'brand', muted, onClick, className, children, 'data-testid': testId }: KpiCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'relative rounded-lg border bg-card px-[18px] py-4 text-left motion-safe:transition-shadow hover:shadow-soft-md',
        onClick && 'cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {icon && <IconSquare icon={icon} tone={tone} size="md" />}
      </div>
      <div className={cn('tabular my-0.5 font-display text-xl font-bold leading-tight tracking-[-0.02em]', muted ? 'text-faint' : 'text-foreground')}>
        {value}
      </div>
      {(hint || delta) && (
        <div className="text-[11.5px] font-medium text-faint">
          {delta && (
            <span className={cn('mr-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-bold', delta.dir === 'up' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
              {delta.dir === 'up' ? '▲' : '▼'} {delta.text}
            </span>
          )}
          {hint}
        </div>
      )}
      {children}
    </Comp>
  );
}

export function MiniKpi({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border bg-surface-3 px-3.5 py-3', className)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="tabular my-0.5 font-display text-[17px] font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 5: `banner.tsx`, `empty-state.tsx`, `period-chip.tsx`, `filter-bar.tsx`**

```tsx
// banner.tsx
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'warn' | 'danger' | 'info' | 'success';

const toneClass: Record<Tone, { box: string; ic: string; Icon: LucideIcon }> = {
  warn: { box: 'border-warn/25 bg-warn-soft text-warn-ink', ic: 'bg-warn', Icon: AlertTriangle },
  danger: { box: 'border-bad/25 bg-bad-soft text-bad-ink', ic: 'bg-bad', Icon: XCircle },
  info: { box: 'border-info/20 bg-[#ecfeff] text-info-ink', ic: 'bg-info', Icon: Info },
  success: { box: 'border-brand-line bg-brand-soft text-brand-ink', ic: 'bg-brand-2', Icon: CheckCircle2 },
};

export function Banner({ tone, title, icon, children, className, role }: {
  tone: Tone; title?: React.ReactNode; icon?: LucideIcon; children?: React.ReactNode; className?: string; role?: string;
}) {
  const t = toneClass[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={cn('mb-3 flex items-start gap-2.5 rounded-sm border px-3.5 py-2.5 text-[12.5px]', t.box, className)}>
      <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-white', t.ic)}>
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
```

```tsx
// empty-state.tsx
import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, message, action, className }: {
  icon?: LucideIcon; title: React.ReactNode; message?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-dashed border-border-strong bg-card px-6 py-14 text-center text-muted-foreground', className)}>
      <Icon className="mx-auto mb-2.5 h-11 w-11 opacity-40" aria-hidden="true" />
      <div className="text-sm font-semibold">{title}</div>
      {message && <div className="mt-1 text-[12.5px] text-faint">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

```tsx
// period-chip.tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function PeriodChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-sm border border-brand-line bg-brand-soft px-3 py-1.5 font-display text-[13px] font-semibold text-brand-ink', className)}>
      <span className="h-[7px] w-[7px] rounded-full bg-brand-2" aria-hidden="true" />
      {children}
    </span>
  );
}
```

```tsx
// filter-bar.tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

// `.filter-row` in the mockup: a white bordered strip that lines fields up on their bottom edge.
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3.5 flex flex-wrap items-end gap-3 rounded-lg border bg-card px-4 py-3.5', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: `data-table.tsx`** — render with the new primitives (same props, same output roles):

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';

export interface DataTableColumn<T> {
  // ReactNode, not string, so a sort control can live inside the header cell it sorts rather
  // than in a separate row above the table. Existing string headers stay valid.
  header: React.ReactNode;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  className?: string;
  'data-testid'?: string;
  rowDataTestId?: string;
}

export function DataTable<T>({
  columns, rows, keyExtractor, emptyMessage = 'No records found.',
  isLoading = false, className, 'data-testid': testId, rowDataTestId,
}: DataTableProps<T>) {
  return (
    <TableWrap className={className}>
      <Table data-testid={testId}>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.className}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</td></tr>
          ) : (
            rows.map((row) => (
              <TableRow key={keyExtractor(row)} data-testid={rowDataTestId}>
                {columns.map((col, i) => (
                  <TableCell key={i} className={cn(col.className)}>{col.accessor(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
```

- [ ] **Step 7:** run the three new specs + `data-table.spec.tsx` → PASS; full jest; `pnpm type-check` → 0.
- [ ] **Step 8: Commit** `feat(ui): table, segmented tabs, kpi, banner, empty-state, period chip, filter bar primitives`

---

## Phase 2 — Feature polish

Every task below follows the same procedure. It is spelled out once here and every
task's own steps refer to it by name ("Polish procedure").

**Polish procedure** (for the files listed in the task):

1. List hardcoded colours:
   `rtk proxy grep -nE '(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|accent|decoration|placeholder)-(red|rose|amber|yellow|orange|green|emerald|lime|blue|indigo|sky|cyan|teal|slate|gray|zinc|neutral|stone|purple|violet|pink|fuchsia)-[0-9]+|#[0-9a-fA-F]{3,6}\b' <files>`
2. Replace each hit using the *Palette mapping* table above. recharts `fill`/`stroke`
   hex → `CHART_COLORS` / `CHART_STATUS` from `@/lib/chart-colors`.
3. Page title `<h1>` (if any) → `PageHeader` (keep text; move right-side controls to `action`).
4. Stat / summary tiles → `KpiCard` inside `KpiGrid` (keep `data-testid`s on the same
   element role: pass `data-testid` to `KpiCard`). Panels with a title row → `Card` +
   `CardHead` (lucide icon + tone chosen by meaning: money `brand`, cost `dark`,
   alerts `danger`/`warn`, info/time `info`).
5. Hand-rolled tab rows (`role="tab"` or button rows toggling a state) → `ModeTabs`
   (top-level mode switch) or `SubTabs` (secondary filter), only when the existing
   element is a plain controlled switch. Keep `data-testid`s via `items[].data-testid`.
6. Tables: plain `<table>` → `Table*` primitives. Complex tables (sticky multi-row
   headers, colSpan matrices, virtualised) → keep markup, restyle `th` to
   `bg-table-head text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground`
   and `td` to `text-xs` with `border-b`, row hover `hover:bg-row-hover`.
7. Filter rows → wrap in `FilterBar`; inline coloured notices → `Banner`; "no data"
   blocks → `EmptyState` (keep text).
8. Numbers in money/kg/% columns or values: add `tabular` and, for headline values,
   `font-display`.
9. Run the area's specs: `NODE_OPTIONS=--max-old-space-size=4096 npx jest <area paths>`.
   A failing assertion on a *replaced palette class* is updated to the new token class
   (same intent). Any other failure is a regression — fix the code, not the test.
10. `pnpm type-check` → 0. Re-run step 1 → zero hits except intentional categorical
    hues documented in a comment.
11. Commit `style(<area>): adopt green design system`.

### Task 5: Dashboard
Files: `src/app/(dashboard)/dashboard/**`, `src/features/air-shipments/components/DashboardAlertCards.tsx`, `src/features/general-params/**`.
- [ ] Polish procedure. Alert cards become the mockup's `alert-kpi` look: `KpiCard`-style tile with 26px icon square per alert kind (reservation `brand`, tracking `alt`, potential `warn`, breach `danger`, TJPH `danger`, OTP `brand`), number `font-display text-[22px] font-extrabold`, zero values `text-faint`, sub-row with dashed top border. Date range inputs → `FilterBar`; AIR/SEA switch → `ModeTabs`; live/sync indicator → `LiveBadge`.

### Task 6: Air Shipments + Google Sheet Config + SLA
Files: `src/app/(dashboard)/air-shipments/**`, `src/app/(dashboard)/sla/**`, `src/features/air-shipments/**` (except DashboardAlertCards, done in Task 5).
- [ ] Polish procedure. Wide shipments table keeps its markup (complex) — restyle per step 6 with the mockup's dense variant (`th text-[9px] py-2`, `td text-[11px] py-[7px]`). Status pills → `Badge` variants. SLA alert tiles reuse the Task 5 tile styling.

### Task 7: P&L
Files: `src/app/(dashboard)/pnl/**`, `src/features/pnl/**`.
- [ ] Polish procedure. `PnlKpiCards` → `KpiGrid`/`KpiCard` with icons: revenue `Wallet`/`brand`, cost `ArrowUpFromLine`/`dark`, GP `TrendingUp`/`alt`, margin `Target`/`brand` (`#2d7a4a` via className if needed), TOs `Package`/`light`, AWB `Receipt`/`muted`. Positive/negative margin cells → `text-good`/`text-bad` font-bold. Period display → `PeriodChip`. Mode/sub tabs → `ModeTabs`/`SubTabs`.

### Task 8: P&L Analytics + P&L Settlement
Files: `src/features/pnl-analytics/**`, `src/features/pnl-settlement/**`.
- [ ] Polish procedure. Charts use `CHART_COLORS`; grid lines `CHART_STATUS.grid`, axis ticks `CHART_STATUS.axis`, 10.5px.

### Task 9: Barhal
Files: `src/app/(dashboard)/barhal/**`, `src/features/barhal/**`.
- [ ] Polish procedure. `BarhalStatCards` → `KpiCard`. Expand chevrons `text-faint hover:text-brand-2`. Monospace-ish numbers `font-display tabular`.

### Task 10: Fleet
Files: `src/app/(dashboard)/fleet/**`, `src/features/fleet/**`.
- [ ] Polish procedure. `FleetSummaryCards` → `KpiCard`. Document-expiry lists take the mockup `action-item` look: `rounded-sm bg-surface-2 border-l-[3px]`, overdue `bg-[#fef5f5] border-l-bad`, soon `bg-[#fffbe8] border-l-warn`; doc chips `font-display font-extrabold text-[10.5px]`. Document status pills: aktif `bg-good-soft text-brand-ink`, segera `bg-warn-soft text-warn-ink`, kadaluarsa `bg-bad-soft text-bad-ink`, pending `bg-surface-2 text-faint border-dashed`. Nopol `font-display font-extrabold`.

### Task 11: Route Simulation
Files: `src/app/(dashboard)/route-simulation/**`, `src/features/route-simulation/**` (components only; `engine/`, `state/`, `utils/` untouched).
- [ ] Polish procedure. Account cards take the mockup `akun-card` look (header `bg-surface-3 border-b`, name `font-display font-bold`); numeric inputs `font-display tabular text-right`.

### Task 12: Route Groups + Vendor Groups
Files: `src/app/(dashboard)/route-groups/**`, `src/app/(dashboard)/vendor-groups/**`, `src/features/route-groups/**`, `src/features/vendor-groups/**`.
- [ ] Polish procedure. Group headers `bg-brand-soft text-brand-ink font-bold rounded-t-sm`.

### Task 13: Settings, Audit, Auth, shared filters
Files: `src/app/(dashboard)/settings/**`, `src/app/(dashboard)/dashboard/{users,roles,invitations,organizations}/**`, `src/app/(dashboard)/audit/**`, `src/app/(auth)/**`, `src/app/invite/**`, `src/features/{users,roles,invitations,organizations,permissions,auth}/**`, `src/components/shared/{multi-route-filter,multi-vendor-filter,info-tooltip,confirm-dialog}.tsx`.
- [ ] Polish procedure. User cells: 32px `bg-brand-2` avatar initials + name/email stack. Login page: card on `bg-background` with `BrandLogo` and `font-display` title; primary button full width.

### Task 14: Final sweep and verification
- [ ] `rtk proxy grep -rnE '<palette regex from step 1>' src --include='*.tsx' | grep -v spec` → only documented categorical hues remain.
- [ ] `pnpm type-check`, `pnpm lint`, full jest → green (suite/test counts ≥ baseline + new specs).
- [ ] `pnpm dev`; screenshot `/dashboard`, `/air-shipments`, `/sla/air`, `/pnl`, `/barhal`, `/fleet`, `/route-simulation`, `/route-groups`, `/vendor-groups`, `/settings/users`, `/login`; compare with `app-unified.html`; fix visible regressions.
- [ ] Commit `style(ui): final sweep`.
