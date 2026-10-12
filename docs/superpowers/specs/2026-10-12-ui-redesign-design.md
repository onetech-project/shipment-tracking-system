# UI Redesign — adopt the `app-unified.html` design system

**Date:** 2026-10-12
**Branch:** `feature/ui-redesign` (from `main`)
**Source of truth:** `app-unified.html` (repo root, static mockup)
**Scope:** `apps/frontend` only. No backend, API, data or routing changes.

## Goal

Re-skin the whole Next.js frontend to the green "Eka Satya Puspita" design in
`app-unified.html`: palette, typography, sidebar shell, page header, cards, KPI
tiles, tabs, tables, form fields, badges, banners and empty states. Page content
and data stay as they are — this is a visual change, not a feature change (e.g.
the Dashboard keeps its SLA alert cards; it does not gain the mockup's P&L hero).

## Decisions

| Topic | Decision |
|---|---|
| Approach | Remap shadcn HSL tokens + add semantic Tailwind tokens; mockup variants live in `cva` primitives. No copy-pasted global mockup classes. |
| Icons | `lucide-react` (already used) inside coloured squares, not emoji. |
| Dark mode | Dropped. Remove the unused `.dark` block. |
| Fonts | Inter (body) + Space Grotesk (display/numbers) via `next/font/google`. |
| Rollout | Foundation first (tokens → shell → primitives), then every feature area is polished. All on one branch, one commit per step/area. |

## 1. Tokens & typography

`src/app/globals.css` (`:root`, HSL triplets for shadcn tokens):

| shadcn token | hex |
|---|---|
| background | `#f7faf7` |
| foreground | `#0f1a0f` |
| card / popover | `#ffffff` |
| primary | `#3dae68` (fg white) |
| secondary / muted / accent | `#f3f6f3` (fg `#0f1a0f`) |
| muted-foreground | `#556655` |
| destructive | `#b91c1c` |
| border / input | `#e2ebe2` |
| ring | `#4fc87b` |
| sidebar-bg / fg / muted | `#141b14` / `#c5d0c5` / `#6c856c` |

Extra Tailwind colours (`tailwind.config.ts`, plain hex — no opacity juggling needed
beyond what `/` modifiers give us on hex in Tailwind 3.4):

- `brand` `#4fc87b`, `brand-2` `#3dae68`, `brand-hover` `#2d8f54`, `brand-ink` `#1f5a35`,
  `brand-soft` `#e2f5e9`, `brand-light` `#7ddba0`, `brand-line` `#c6ead3`
- `ink` `#141c17`, `ink-2` `#1f2a22`
- `surface-2` `#f3f6f3`, `surface-3` `#fafcfa`, `table-head` `#f5f8f5`, `row-hover` `#f8fcf9`
- `border-strong` `#cdd9cd`, `faint` `#8a9a8a`
- status: `good` `#3dae68` / `good-soft` `#e2f5e9`; `warn` `#ca8a04` / `warn-soft` `#fef9c3` / `warn-ink` `#713f12`;
  `bad` `#b91c1c` / `bad-soft` `#fee2e2` / `bad-ink` `#7f1d1d` / `bad-strong` `#dc2626`;
  `info` `#0e7490` / `info-soft` `#cffafe` / `info-ink` `#0c4a6e`

Radius: `--radius: 0.875rem` (14px). `rounded-lg` = 14px (cards, dialogs),
`rounded-md` = 10px, `rounded-sm` = 8px (controls). Shadows: `shadow-soft-sm`,
`shadow-soft-md` from the mockup.

Fonts: `next/font/google` Inter (400–800) → `--font-sans`, Space Grotesk (500–700)
→ `--font-display`; Tailwind `font-sans`, `font-display`. Body 14px / 1.55,
antialiased, `<html lang="id">`. Custom thin scrollbar in `@layer base`.

## 2. Shell

- **Sidebar** (`components/layout/sidebar.tsx`): bg `#141b14`, 248px open / 56px
  collapsed. Brand block: 42px green square "ESP" + "Shipment Tracker" /
  "EKA SATYA PUSPITA" small caps; collapse toggle sits beside it. Nav item 13px
  medium, `rounded-[9px]`, hover `white/5`, active `brand/18` + white text + 3px
  green bar on the left edge. Section labels 10px bold uppercase `tracking-[0.1em]`
  `#6c856c`. Optional `badge` prop on `NavLink` (SLA Monitoring gets "LIVE").
  Sign-out stays at the bottom. Permission logic unchanged.
- **MobileDrawer / TopBar**: same sidebar, drawer width 248px; top bar gets token
  border/background and the small ESP logo.
- **DashboardShell**: `main` padding `px-4 py-4 lg:px-8 lg:pt-[26px] lg:pb-14`,
  content wrapper `max-w-[1700px]`.
- **PageHeader**: h1 `font-display` 24px bold `tracking-[-0.02em]`; subtitle 13px
  muted; new optional `badge` slot beside the title; actions right-aligned,
  `gap-2.5`, wrap. Existing props unchanged.
- New `StagingBadge`, `LiveBadge` (pulsing dot).

## 3. Primitives

All via `cva` + `cn()`; existing props/variants keep working.

- **Card**: `rounded-lg border bg-card`, no shadow; `interactive` prop adds hover
  `shadow-soft-md`. New `CardHead` ( `icon`, `tone`, `title`, `subtitle`,
  `actions`) — 28px coloured icon square, display 14px title, border-bottom,
  `px-[18px] py-3.5`. `CardContent` padding `px-[18px] py-4`. `CardTitle` →
  display 14px bold.
  Icon tones: `brand` `#3dae68`, `alt` `#4fc87b`, `light` `#7ddba0`, `dark`
  `#1f2a22` (icon `#7ddba0`), `info`, `warn`, `danger` `#dc2626`, `muted` `#556655`.
- **Button**: `rounded-sm` (8px), 13px. Sizes `default` h-9 px-3.5, `sm` h-8 px-2.5
  text-xs, `lg` h-10 px-5, `icon` h-9 w-9. Variants: `default` (brand-2, hover
  brand-hover, semibold), `outline` (white, border, hover border-strong +
  surface-2), `secondary`, `ghost`, `link`, `destructive`, new `subtle`,
  `danger-soft`, `ghost-dark`.
- **Badge**: pill. Existing variants kept; new `active`, `inactive`, `pending`,
  `danger`, `info`, `neutral` (10.5px bold uppercase). `StatusBadge` maps onto them.
- **Input**: h-8, `rounded-[7px]`, 12.5px medium, focus border brand + 1px ring.
  `Label` / `FormField` label: 10.5px bold uppercase `tracking-[0.06em]` muted.
- **Dialog / Sheet / DropdownMenu**: token radius/border/shadow only.
- New `components/ui/table.tsx` (`Table`, `TableHeader`, `TableBody`, `TableRow`,
  `TableHead`, `TableCell`; `num` prop for right-aligned tabular numbers): th 10px
  bold uppercase `tracking-[0.06em]` muted on `table-head`, sticky; td 12px
  `px-2.5 py-[9px]`; first column `pl-3.5`; row hover `row-hover`. Wrapper
  `rounded-md border overflow-x-auto`. `DataTable` uses it.
- New `components/ui/segmented.tsx`: `ModeTabs` (grey segmented, active white +
  shadow) and `SubTabs` (bordered chips, active `brand-ink`). Controlled
  (`value`, `onValueChange`, `items`), `role="tablist"`/`tab`, `aria-selected`.
- New `components/shared/`: `KpiCard` + `KpiGrid` (`cols` 3–6, responsive),
  `MiniKpi`, `Banner` (`warn|danger|info|success`), `EmptyState`, `PeriodChip`,
  `FilterBar`, `IconSquare` (the coloured lucide square used by CardHead/KpiCard).

## 4. Feature polish (every area)

Per area, apply consistently:

1. Hardcoded palette classes → semantic tokens:
   - green/emerald (positive, success, profit) → `good`/`good-soft`/`brand-ink`
   - red/rose (negative, error, breach) → `bad`/`bad-soft`/`bad-ink`
   - amber/yellow/orange (warning, pending, estimated) → `warn`/`warn-soft`/`warn-ink`
   - blue/indigo/sky/cyan (info, links, selection) → `info`/`info-soft`/`info-ink`,
     or `brand-*` when it was really "primary/selected"
   - slate/gray/zinc → `muted`, `muted-foreground`, `faint`, `border`, `surface-2`
   - hex in charts (recharts) → the mockup chart palette `#3dae68 #4fc87b #7ddba0
     #1f2a22 #2d7a4a #0e7490 #ca8a04 #dc2626 #556655`.
   Colours that encode *distinct categories* (not status) may keep a hue but use the
   chart palette.
2. Raw `<h1>` page titles → `PageHeader`.
3. Stat/summary tiles → `KpiCard` / `MiniKpi`; panels → `Card` + `CardHead`.
4. Hand-rolled tab rows → `ModeTabs` / `SubTabs` where the behaviour is a plain
   controlled tab switch.
5. Raw tables: adopt `Table` primitives where the markup is a plain table; for
   complex tables (sticky matrices, merged headers) restyle classes in place to the
   same th/td spec instead of restructuring.
6. Filter rows → `FilterBar`; inline warnings → `Banner`; empty lists → `EmptyState`.

Areas: Dashboard · Air Shipments + Google Sheet Config · SLA (air/sea) · P&L ·
P&L Analytics · P&L Settlement · Barhal · Fleet · Route Simulation · Route Groups ·
Vendor Groups · Settings (roles/users/invitations/organizations/permissions/general
params) · Audit · Auth (login/invite).

## Contrast deviation from the mockup (decided 2026-10-13)

The mockup's text-bearing colours fail WCAG AA (white on `#3dae68` is 2.8:1; `#8a9a8a` hint text
~2.9:1; `#3dae68`/`#ca8a04` status text ~2.9:1). Darkened, keeping the hue:

| Token | Mockup | Shipped | Contrast |
|---|---|---|---|
| `--primary` (buttons, active pills) | `#3dae68` | `#267d4a` | 5.1:1 white label |
| `brand.hover` | `#2d8f54` | `#1f6a3e` | 6.6:1 |
| `faint` | `#8a9a8a` | `#647364` | ≥4.6:1 on white/bg/surface-2 |
| `good` | `#3dae68` | `#267d4a` | 5.1:1 on white, 4.5:1 on good-soft |
| `warn` | `#ca8a04` | `#a16207` | 4.9:1 on white, 4.6:1 on warn-soft |

`brand`/`brand-2`/`brand-light` stay bright for fills, dots, icon squares and charts
(`CHART_COLORS` is unchanged).

## Non-goals

- No new data, endpoints, or page sections that the app does not already have.
- No behaviour change: same handlers, same `data-testid`s, same text content.
- No dark mode, no route transition animation.

## Testing

- `pnpm --filter frontend type-check`, `lint`, `test` green.
- Specs that assert on a palette class that this redesign intentionally replaces
  are updated to assert on the new token class; behaviour assertions untouched.
- Light unit tests for new primitives (variant → class, Tabs ARIA).
- Manual visual pass of every top-level route against the mockup.

## Risks

- Controls get denser (Button h-10 → h-9, Input h-10 → h-8). Check dialogs/forms.
- `rounded-lg` grows to 14px everywhere it is used; acceptable for containers,
  controls use `rounded-sm`/`rounded-md`.
- Spec-file class assertions may churn; only update the class, never the intent.
