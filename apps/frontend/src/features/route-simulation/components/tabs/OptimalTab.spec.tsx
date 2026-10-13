import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState, EspVsPartner, espVsPartner, evaluatePlan, optimizePlan } from '../../engine'
import { fmtIdr } from '../../utils/format'
import { OptimalTab } from './OptimalTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

// The route band row (RouteChip, e.g. 'CGK → Aceh') plus every row below it up to (not including)
// the next band row, found by its route chip (span.font-mono). This scopes assertions to the one
// route they claim to describe, instead of the whole page.
function routeRows(label: string): HTMLElement[] {
  const chip = screen.getByText(label, { selector: 'span.font-mono' })
  const band = chip.closest('tr')
  if (!band) throw new Error(`no <tr> around route chip ${label}`)
  const rows: HTMLElement[] = [band]
  let el = band.nextElementSibling
  while (el && !el.querySelector('span.font-mono')) {
    rows.push(el as HTMLElement)
    el = el.nextElementSibling
  }
  return rows
}

function hasTextIn(rows: HTMLElement[], text: string | RegExp): boolean {
  return rows.some((r) => within(r).queryAllByText(text).length > 0)
}

function countTextIn(rows: HTMLElement[], text: string): number {
  return rows.reduce((n, r) => n + within(r).queryAllByText(text).length, 0)
}

// Mirrors OptimalTab's Verdict component exactly, so the expectation is computed from the engine
// rather than a number pinned by hand.
function verdictText(c: EspVsPartner): string {
  if (c.winner === 'esp' && !c.bestPartner) return 'Pakai ESP sendiri: vendor lain belum punya lane layak'
  if (c.winner === 'partner' && !c.esp) return `Pakai ${c.bestPartner!.account.name}: ESP belum punya lane layak`
  if (c.winner === 'esp') return `Pakai ESP sendiri unggul ${fmtIdr(c.gap)}/kg vs ${c.bestPartner!.account.name}`
  if (c.winner === 'partner') return `Pakai ${c.bestPartner!.account.name} unggul ${fmtIdr(-c.gap)}/kg vs ESP`
  if (c.winner === 'tie') return 'ESP dan vendor lain seimbang'
  return 'Belum cukup data untuk membandingkan'
}

it('summarises why each route runs the way it does', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/rute cukup 1 vendor 1 airlines/)).toBeInTheDocument()
  expect(screen.getByText('Pemakaian modal')).toBeInTheDocument()
  expect(screen.getByText(/Net margin \/ 12 periode/)).toBeInTheDocument()
})

it('flags capital that no lane can use', () => {
  // AURI has never flown, so it owns no lane: its money can only sit idle.
  const auri = { id: 'AURI', name: 'AURI', isEsp: false, enabled: true, tranches: [{ id: 'AURI-1', label: 'Modal AURI', amount: 1e9, cofType: 'percent' as const, cofValue: 1, cofUnit: 'month' as const, cycleDays: 30 }] }
  render(<OptimalTab source={src} sim={{ ...sim, accounts: [...sim.accounts, auri] }} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Modal AURI').closest('tr')).toHaveTextContent('Menganggur')
})

it('jumps to Coba-coba', () => {
  const onOpenSim = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={onOpenSim} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka Coba-coba' }))
  expect(onOpenSim).toHaveBeenCalled()
})

it('explains that there is no capital yet instead of blaming routes and tranches for idling', () => {
  // createState's default accounts each have one tranche of amount 0: no capital anywhere.
  const noCapSim = createState(src)
  render(<OptimalTab source={src} sim={noCapSim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/Belum ada modal\. Isi nominal modal tiap akun di tab 1 · Setup Histori & Akun/)).toBeInTheDocument()
  expect(screen.queryByText('Menganggur')).not.toBeInTheDocument()
  expect(screen.queryByText(/lebih menguntungkan/)).not.toBeInTheDocument()
  expect(screen.getAllByText('Belum ada modal untuk dialokasikan. Isi modal di tab 1.').length).toBeGreaterThan(0)
})

it('applies a new start and horizon only when Run is pressed', () => {
  const dispatch = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={dispatch} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Sep 2026 H1 s.d. Feb 2027 H2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run ulang' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Simulasi mulai'), { target: { value: '2026-10-1H' } })
  const horizon = screen.getByLabelText('Horizon simulasi (periode)')
  fireEvent.change(horizon, { target: { value: '4' } })
  fireEvent.blur(horizon)
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByText('belum diterapkan')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Run perubahan' }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'setSimRange', simStart: '2026-10-1H', horizonPeriods: 4 })
})

it('clears a stale draft when a new scenario is loaded', () => {
  const dispatch = jest.fn()
  const { rerender } = render(<OptimalTab source={src} sim={sim} dispatch={dispatch} onOpenSim={jest.fn()} />)
  const horizon = screen.getByLabelText('Horizon simulasi (periode)')
  fireEvent.change(horizon, { target: { value: '4' } })
  fireEvent.blur(horizon)
  expect(screen.getByText('belum diterapkan')).toBeInTheDocument()
  const loaded = { ...sim, horizonPeriods: 6 }
  rerender(<OptimalTab source={src} sim={loaded} dispatch={dispatch} onOpenSim={jest.fn()} />)
  expect(screen.queryByText('belum diterapkan')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Horizon simulasi (periode)')).toHaveValue(6)
})

it('keeps a scenario loaded with a simStart older than today selectable', () => {
  const older = { ...sim, simStart: '2025-01-1H' }
  render(<OptimalTab source={src} sim={older} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  const select = screen.getByLabelText('Simulasi mulai') as HTMLSelectElement
  expect(select.options[0].value).toBe('2025-01-1H')
  expect(select.value).toBe('2025-01-1H')
})

it('scales the totals to the horizon, 15 days per period', () => {
  const two = { ...sim, horizonPeriods: 2 }
  render(<OptimalTab source={src} sim={two} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  const net = evaluatePlan(src, two, optimizePlan(src, two)).totals.net
  expect(screen.getByText('Net margin / 2 periode').nextSibling).toHaveTextContent(fmtIdr(net * 30))
})

it('compares the best ESP lane with each partner vendor on every route', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  // Jabo|Aceh has SILI, PRIME and ESP lanes, so both sides of the comparison exist.
  const c = espVsPartner(sim, 'Jabo|Aceh')
  expect(c.esp).not.toBeNull()
  expect(c.bestPartner).not.toBeNull()
  const rows = routeRows('CGK → Aceh')
  expect(hasTextIn(rows, verdictText(c))).toBe(true)
  expect(countTextIn(rows, 'ESP sendiri')).toBe(1)
  expect(countTextIn(rows, 'Vendor lain')).toBe(c.partners.length)
  expect(hasTextIn(rows, 'Perbandingan ESP vs vendor lain')).toBe(true)
})

it('says when ESP has no workable lane on a route', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  // Jabo|Ambon has only SILI and PRIME lanes: ESP has nothing to compare.
  const c = espVsPartner(sim, 'Jabo|Ambon')
  expect(c.esp).toBeNull()
  expect(c.bestPartner).not.toBeNull()
  const ambonRows = routeRows('CGK → Ambon')
  expect(hasTextIn(ambonRows, 'ESP belum punya lane layak di rute ini (cek centang Ikut dan cost di tab 2).')).toBe(true)
  expect(hasTextIn(ambonRows, /^Pakai .*: ESP belum punya lane layak$/)).toBe(true)
  const acehRows = routeRows('CGK → Aceh')
  expect(hasTextIn(acehRows, /ESP belum punya lane layak di rute ini/)).toBe(false)
})

it('shows the daily load the active lanes offer next to the route tonnage', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText(/Load\/hari \(\d+ vendor\) [\d.]+ kg/).length).toBe(sim.routes.length)
  expect(screen.getAllByText(/^(cukup|kurang [\d.]+ kg|belum ada load)$/).length).toBe(sim.routes.length)
})
