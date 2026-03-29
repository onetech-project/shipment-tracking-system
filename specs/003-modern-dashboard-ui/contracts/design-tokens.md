# Contract: Design Tokens

**Feature**: `003-modern-dashboard-ui`  
**Type**: Design System Token Contract  
**Status**: Complete

This document defines the **source of truth** for all visual design tokens used by the
revamped UI. Changing a value here (in `src/app/globals.css`) updates the entire application's
visual style without touching individual component files — fulfilling FR-015 and SC-008.

---

## 1. Token File Location

**File**: `src/app/globals.css`

This file is the single Tailwind CSS entry point and CSS custom-property definition file.
All tokens are defined here as CSS custom properties under `:root {}`.

---

## 2. Tailwind CSS Configuration

**File**: `apps/frontend/tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Mapped to CSS custom properties — single source of truth
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        sidebar: {
          DEFAULT:    'hsl(var(--sidebar-bg))',
          foreground: 'hsl(var(--sidebar-fg))',
          muted:      'hsl(var(--sidebar-muted))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 3. globals.css Token Definitions

```css
/* src/app/globals.css */

@import "tailwindcss";

@layer base {
  :root {
    /* ── Core palette ──────────────────────────── */
    --background:            0 0% 100%;
    --foreground:            222.2 84% 4.9%;

    /* ── Card ──────────────────────────────────── */
    --card:                  0 0% 100%;
    --card-foreground:       222.2 84% 4.9%;

    /* ── Popover ───────────────────────────────── */
    --popover:               0 0% 100%;
    --popover-foreground:    222.2 84% 4.9%;

    /* ── Primary action (blue-600) ─────────────── */
    --primary:               221.2 83.2% 53.3%;
    --primary-foreground:    210 40% 98%;

    /* ── Secondary ─────────────────────────────── */
    --secondary:             210 40% 96.1%;
    --secondary-foreground:  222.2 47.4% 11.2%;

    /* ── Muted / subtle ─────────────────────────── */
    --muted:                 210 40% 96.1%;
    --muted-foreground:      215.4 16.3% 46.9%;

    /* ── Accent ─────────────────────────────────── */
    --accent:                210 40% 96.1%;
    --accent-foreground:     222.2 47.4% 11.2%;

    /* ── Destructive (red) ──────────────────────── */
    --destructive:           0 84.2% 60.2%;
    --destructive-foreground:210 40% 98%;

    /* ── Borders & inputs ───────────────────────── */
    --border:                214.3 31.8% 91.4%;
    --input:                 214.3 31.8% 91.4%;
    --ring:                  221.2 83.2% 53.3%;

    /* ── Border radius ──────────────────────────── */
    --radius:                0.5rem;

    /* ── Sidebar (slate-900 base) ───────────────── */
    --sidebar-bg:            222.2 47.4% 11.2%;
    --sidebar-fg:            210 40% 98%;
    --sidebar-muted:         215.4 16.3% 46.9%;
  }

  /* Dark mode tokens — same variable names, different values */
  .dark {
    --background:            222.2 84% 4.9%;
    --foreground:            210 40% 98%;
    --card:                  222.2 84% 4.9%;
    --card-foreground:       210 40% 98%;
    --popover:               222.2 84% 4.9%;
    --popover-foreground:    210 40% 98%;
    --primary:               217.2 91.2% 59.8%;
    --primary-foreground:    222.2 47.4% 11.2%;
    --secondary:             217.2 32.6% 17.5%;
    --secondary-foreground:  210 40% 98%;
    --muted:                 217.2 32.6% 17.5%;
    --muted-foreground:      215 20.2% 65.1%;
    --accent:                217.2 32.6% 17.5%;
    --accent-foreground:     210 40% 98%;
    --destructive:           0 62.8% 30.6%;
    --destructive-foreground:210 40% 98%;
    --border:                217.2 32.6% 17.5%;
    --input:                 217.2 32.6% 17.5%;
    --ring:                  224.3 76.3% 48%;
  }

  /* Base reset */
  * {
    @apply border-border;
    box-sizing: border-box;
  }

  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, sans-serif;
  }
}
```

---

## 4. PostCSS Configuration

**File**: `apps/frontend/postcss.config.mjs`

```javascript
/** @type {import('postcss').Config} */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## 5. shadcn/ui components.json

**File**: `apps/frontend/components.json`  
Generated by `npx shadcn@latest init` with the following answers:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## 6. Update Protocol (SC-008)

To update any design token across the entire application:

1. Edit the HSL value of the relevant CSS custom property in `src/app/globals.css` under `:root {}`
2. Run `npm run build` to confirm no TypeScript errors
3. Run `npm run test:e2e` to confirm no visual regressions in Playwright tests
4. No individual component files need to be touched

**This fulfils SC-008**: "the application visual style can be updated by changing a single
Tailwind configuration or CSS variable file without touching individual component files."

---

## 7. Breakpoint Contract

All responsive behaviour uses Tailwind's standard breakpoints:

| Breakpoint | Min Width | Usage in this feature |
|------------|-----------|----------------------|
| (default)  | 0 px      | Mobile-first base styles |
| `sm:`      | 640 px    | Two-column form layouts, card grids starting |
| `md:`      | 768 px    | Tablet adjustments |
| `lg:`      | 1024 px   | Desktop sidebar visible; hamburger hidden |
| `xl:`      | 1280 px   | Wider content area |

**FR-004 breakpoint**: `1024 px` (`lg:`) — sidebar permanent above, Sheet drawer below.
