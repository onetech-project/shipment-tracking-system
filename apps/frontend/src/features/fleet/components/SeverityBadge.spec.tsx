import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SeverityBadge } from './SeverityBadge'

describe('SeverityBadge', () => {
  it('renders the severity label', () => {
    render(<SeverityBadge severity="crit" />)
    expect(screen.getByText('Kadaluarsa')).toBeInTheDocument()
  })

  it('appends the remaining days when given', () => {
    render(<SeverityBadge severity="warn" daysLeft={12} />)
    expect(screen.getByText(/12 hari lagi/)).toBeInTheDocument()
  })

  it('shows only the label when no day count is given', () => {
    render(<SeverityBadge severity="ok" />)
    expect(screen.queryByText(/hari/)).not.toBeInTheDocument()
  })

  it('prefers an explicit label over the severity default', () => {
    render(<SeverityBadge severity="crit" label="STNK" />)
    expect(screen.getByText(/STNK/)).toBeInTheDocument()
  })

  // The tone and dot classes are the colour channel of the signal. Left unpinned, a badge that
  // silently loses its tone or paints every dot the same colour still passes every text
  // assertion above.
  it.each([
    ['crit', 'bg-red-50 text-red-700 ring-red-600/20', 'bg-red-500'],
    ['warn', 'bg-amber-50 text-amber-800 ring-amber-600/20', 'bg-amber-500'],
    ['ok', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'bg-emerald-500'],
    // Grey, never green: no dated document is an absence of information, not a clean bill of
    // health.
    ['none', 'bg-slate-100 text-slate-600 ring-slate-500/20', 'bg-slate-400'],
  ] as const)('paints %s with its own tone and dot', (severity, tone, dot) => {
    render(<SeverityBadge severity={severity} />)
    const badge = screen.getByRole('status')
    tone.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
    const marker = badge.querySelector('[aria-hidden="true"]')
    expect(marker).toHaveClass('h-1.5', 'w-1.5', 'rounded-full', dot)
    // No other severity's dot may leak in — this is what stops every dot collapsing to one
    // colour, green in particular.
    const others = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-slate-400'].filter(
      (c) => c !== dot,
    )
    others.forEach((c) => expect(marker).not.toHaveClass(c))
  })

  it('keeps the badge shape classes alongside the severity tone', () => {
    render(<SeverityBadge severity="warn" className="ml-2" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-full', 'ring-1', 'ring-inset')
    expect(badge).toHaveClass('ml-2')
  })

  // Colour alone is not an accessible signal, and a screen reader reading "Kadaluarsa" without
  // saying what expired tells the operator nothing actionable.
  it('carries a text label a screen reader can read', () => {
    render(<SeverityBadge severity="crit" daysLeft={-3} label="KIR" />)
    expect(screen.getByRole('status')).toHaveTextContent('KIR')
    expect(screen.getByRole('status')).toHaveTextContent('Lewat 3 hari')
  })
})
