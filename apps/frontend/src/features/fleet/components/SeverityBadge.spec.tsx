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
    // Replacement, not concatenation: a badge reading "KadaluarsaSTNK" satisfies /STNK/ too.
    expect(screen.getByRole('img')).not.toHaveTextContent('Kadaluarsa')
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'STNK')
  })

  // The tone and dot classes are the colour channel of the signal. Left unpinned, a badge that
  // silently loses its tone or paints every dot the same colour still passes every text
  // assertion above.
  it.each([
    ['crit', 'bg-bad-soft text-bad-ink ring-bad/20', 'bg-bad-strong'],
    ['warn', 'bg-warn-soft text-warn-ink ring-warn/20', 'bg-warn'],
    ['ok', 'bg-good-soft text-brand-ink ring-good/20', 'bg-good'],
    // Grey, never green: no dated document is an absence of information, not a clean bill of
    // health.
    ['none', 'bg-surface-2 text-faint border border-dashed border-border ring-transparent', 'bg-faint'],
  ] as const)('paints %s with its own tone and dot', (severity, tone, dot) => {
    render(<SeverityBadge severity={severity} />)
    const badge = screen.getByRole('img')
    tone.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
    const marker = badge.querySelector('[aria-hidden="true"]')
    expect(marker).toHaveClass('h-1.5', 'w-1.5', 'rounded-full', dot)
    // No other severity's dot may leak in — this is what stops every dot collapsing to one
    // colour, green in particular.
    const others = ['bg-bad-strong', 'bg-warn', 'bg-good', 'bg-faint'].filter((c) => c !== dot)
    others.forEach((c) => expect(marker).not.toHaveClass(c))
  })

  it('keeps the badge shape classes alongside the severity tone', () => {
    render(<SeverityBadge severity="warn" className="ml-2" />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-full', 'ring-1', 'ring-inset')
    expect(badge).toHaveClass('ml-2')
  })

  // Colour alone is not an accessible signal, and a screen reader reading "Kadaluarsa" without
  // saying what expired tells the operator nothing actionable.
  it('carries a text label a screen reader can read', () => {
    render(<SeverityBadge severity="crit" daysLeft={-3} label="KIR" />)
    expect(screen.getByRole('img')).toHaveTextContent('KIR')
    expect(screen.getByRole('img')).toHaveTextContent('Lewat 3 hari')
  })

  // The accessible name has to carry the same reading a sighted user gets. It is the whole
  // justification for dropping role="status": without the label, moving off a live region
  // would leave a screen-reader operator with nothing at all.
  it('names itself with the label and the expiry a sighted user sees', () => {
    render(<SeverityBadge severity="crit" daysLeft={-3} label="KIR" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('KIR · Lewat 3 hari')
  })

  it('names itself with the label alone when there is no day count', () => {
    render(<SeverityBadge severity="ok" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Aktif')
  })

  // Not role="status". One badge per row turns a 25-row page into 25 ARIA live regions that all
  // announce on every sort and filter, which is worse for a screen-reader operator than silence.
  it('is not an ARIA live region', () => {
    render(<SeverityBadge severity="warn" daysLeft={12} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
