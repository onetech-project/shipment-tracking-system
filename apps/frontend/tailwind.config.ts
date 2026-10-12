import type { Config } from 'tailwindcss';

const config: Config = {
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
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'Space Grotesk', 'var(--font-sans)', 'sans-serif'],
      },
      colors: {
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
      },
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(15,30,20,.05), 0 1px 2px rgba(15,30,20,.04)',
        'soft-md': '0 2px 8px rgba(15,30,20,.06)',
      },
      borderRadius: {
        lg: 'var(--radius)',              // 14px — cards, dialogs
        md: 'calc(var(--radius) - 4px)',  // 10px
        sm: 'calc(var(--radius) - 6px)',  // 8px — controls
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
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-soft': 'pulse-soft 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
