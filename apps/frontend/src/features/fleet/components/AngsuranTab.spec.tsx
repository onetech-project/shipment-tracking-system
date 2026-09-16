import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AngsuranTab } from './AngsuranTab'
import { FleetVehicle } from '../types'

function vehicle(over: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: 'v1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    kepemilikan: { id: 'k', code: 'milik_esp', label: 'Milik ESP' },
    pemilikUnit: null,
    jenisArmada: { id: 'a', code: 'cdd', label: 'Colt Diesel Double' },
    lease: null,
    berkasCount: { ada: 0, wajib: 0 },
    documents: [],
    worstSeverity: 'ok',
    ...over,
  } as FleetVehicle
}

const LEASE = {
  id: 'c1',
  leasing: { id: 'l', code: 'mtf', label: 'MTF' },
  nomorKontrak: 'MTF-2024-03-11872',
  cicilanPerBulan: 8750000,
  tenorBulan: 48,
  angsuranMulai: '2024-03-11',
  angsuranTerbayarOverride: null,
  angsuranTerbayar: 30,
  sisaAngsuran: 18,
  sisaKewajiban: 157500000,
  closedAt: null,
}

describe('AngsuranTab', () => {
  it('lists the ownership and contract columns', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
    expect(screen.getByText('Milik ESP')).toBeInTheDocument()
    expect(screen.getByText('MTF')).toBeInTheDocument()
    expect(screen.getByText('MTF-2024-03-11872')).toBeInTheDocument()
  })

  // Every figure arrives settled from the backend; the table formats and never recomputes.
  //
  // With a single vehicle in the fixture the row's own figure equals the footer total (same one
  // contract), so both amounts render twice — getByText alone throws on the duplicate. Scoped to
  // the row instead of widened to getAllByText: that keeps the assertion bound to the row this
  // test is actually about, rather than merely proving the figure is somewhere on the page (which
  // would pass just as well if the row printed the wrong number and only the footer got it right).
  it('shows the instalment figures the backend settled', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    const row = within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')[0]
    expect(within(row).getByText(/8\.750\.000/)).toBeInTheDocument()
    expect(screen.getByText(/48 bln/)).toBeInTheDocument()
    expect(screen.getByText(/30 bln/)).toBeInTheDocument()
    expect(screen.getByText(/18 bln/)).toBeInTheDocument()
    expect(within(row).getByText(/157\.500\.000/)).toBeInTheDocument()
  })

  it('shows progress as a percentage of the tenor', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    expect(screen.getByText(/63%/)).toBeInTheDocument()
  })

  it('marks a settled contract as lunas', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: { ...LEASE, sisaAngsuran: 0, sisaKewajiban: 0 } })]} />)
    expect(screen.getByText(/lunas/i)).toBeInTheDocument()
  })

  it('dashes the columns for a unit with no contract', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: null })]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('names the outside owner of a rented unit', () => {
    render(
      <AngsuranTab
        vehicles={[
          vehicle({
            kepemilikan: { id: 'k', code: 'sewa_lepas_kunci', label: 'Sewa lepas kunci' },
            pemilikUnit: 'CV Rejeki Transport',
          }),
        ]}
      />,
    )
    expect(screen.getByText('CV Rejeki Transport')).toBeInTheDocument()
  })

  // A settled contract is no longer an obligation, so it must not reach the footer totals — the
  // same rule the summary tiles apply.
  it('totals only the contracts still running', () => {
    render(
      <AngsuranTab
        vehicles={[
          vehicle({ id: 'a', lease: LEASE }),
          vehicle({ id: 'b', nopol: 'B 1 B', lease: { ...LEASE, sisaAngsuran: 0, sisaKewajiban: 0 } }),
        ]}
      />,
    )
    const footer = screen.getByRole('rowgroup', { name: /total/i })
    expect(within(footer).getByText(/8\.750\.000/)).toBeInTheDocument()
    expect(within(footer).getByText(/157\.500\.000/)).toBeInTheDocument()
  })

  it('says so when the register is empty', () => {
    render(<AngsuranTab vehicles={[]} />)
    expect(screen.getByText(/belum ada data/i)).toBeInTheDocument()
  })

  // The component's own comment states the intent ("heaviest obligation first"), but nothing
  // exercised the actual DOM order — a mutation that reversed the sort's operands left every
  // other test green. Three distinct sisaKewajiban figures, checked in the order they render.
  it('orders rows by heaviest remaining obligation first', () => {
    render(
      <AngsuranTab
        vehicles={[
          vehicle({ id: 'a', nopol: 'B 1 A', lease: { ...LEASE, sisaKewajiban: 100000000 } }),
          vehicle({ id: 'b', nopol: 'B 2 B', lease: { ...LEASE, sisaKewajiban: 300000000 } }),
          vehicle({ id: 'c', nopol: 'B 3 C', lease: { ...LEASE, sisaKewajiban: 200000000 } }),
        ]}
      />,
    )
    const tbody = screen.getAllByRole('rowgroup')[1]
    const nopolInOrder = within(tbody)
      .getAllByRole('row')
      .map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(nopolInOrder).toEqual(['B 2 B', 'B 3 C', 'B 1 A'])
  })
})
