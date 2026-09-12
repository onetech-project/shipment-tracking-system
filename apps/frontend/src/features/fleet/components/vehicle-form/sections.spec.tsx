import * as React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { IdentitySection } from './IdentitySection'
import { LeaseSection } from './LeaseSection'
import { OperationalSection } from './OperationalSection'
import { DocumentSection } from './DocumentSection'
import { useVehicleForm, VehicleFormApi } from './useVehicleForm'
import { FleetDriver, FleetMasterRow } from '../../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'pool',
  code: 'm1',
  label: 'M1',
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const jenisArmada = [master({ id: 'ja1', category: 'jenis_armada', label: 'Colt Diesel Engkel' })]
const kepemilikan = [
  master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
  master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
]
// 'lunas' is seeded alongside the real financiers and names none: a unit pointed at it was
// bought outright, so the four contract fields have nothing to hold.
const leasing = [
  master({ id: 'ls1', category: 'leasing', code: 'mtf', label: 'MTF' }),
  master({ id: 'ls-lunas', category: 'leasing', code: 'lunas', label: 'Lunas' }),
]
const pool = [master({ id: 'p1', category: 'pool', label: 'Pool Cakung' })]
const status = [master({ id: 's1', category: 'status_kendaraan', label: 'Beroperasi' })]

const drivers: FleetDriver[] = [
  {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    telepon: null,
    simNomor: '3201-1122-3344',
    simJenisId: null,
    simExpiresAt: '2027-03-14',
    isActive: true,
  },
]

const docTypes = [
  master({ id: 'dt-stnk', category: 'jenis_dokumen', code: 'stnk', label: 'STNK', isRequired: true }),
  master({ id: 'dt-servis', category: 'jenis_dokumen', code: 'servis', label: 'Servis Berkala' }),
]

// The sections hold no state of their own, so the real hook drives them. A stub would let a
// section read the wrong key off the api and still pass.
//
// The section renders INSIDE the component that holds the hook, which is the only way it sees a
// state change: handed a `form` captured from a separate renderHook tree it would be frozen at
// the values of the first paint, and every assertion about typing would read a stale DOM.
const renderWithForm = (
  render_: (form: VehicleFormApi) => React.ReactElement,
): { result: { current: VehicleFormApi } } => {
  const result = { current: null as unknown as VehicleFormApi }

  function Harness() {
    const form = useVehicleForm({ docTypes, kepemilikan, leasing, drivers })
    result.current = form
    return render_(form)
  }

  render(<Harness />)
  return { result }
}

describe('IdentitySection', () => {
  it('renders every identity field', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    for (const label of [
      /nomor polisi/i,
      /merk/i,
      /^tipe/i,
      /jenis armada/i,
      /tahun pembuatan/i,
      /kapasitas muatan/i,
      /nomor rangka/i,
      /nomor mesin/i,
      /nomor bpkb/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('lists the jenis armada options it was given', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    expect(screen.getByRole('option', { name: 'Colt Diesel Engkel' })).toBeInTheDocument()
  })

  // Each field asserted against its own key: a caption wired to its neighbour's setter is the
  // defect a nine-field section actually produces, and it writes the wrong column in silence.
  it.each([
    [/nomor polisi/i, 'B9114KYZ', 'nopol', 'B9114KYZ'],
    [/merk/i, 'Mitsubishi', 'merk', 'Mitsubishi'],
    [/^tipe/i, 'Canter FE 74 HD', 'tipe', 'Canter FE 74 HD'],
    [/tahun pembuatan/i, '2021', 'tahun', '2021'],
    [/kapasitas muatan/i, '8 ton', 'kapasitas', '8 ton'],
    [/nomor rangka/i, 'MHM111', 'noRangka', 'MHM111'],
    [/nomor mesin/i, '4D34-1', 'noMesin', '4D34-1'],
    [/nomor bpkb/i, 'M-01', 'noBpkb', 'M-01'],
  ])('writes %s through to the form state', (label, typed, key, expected) => {
    const { result } = renderWithForm((form) => (
      <IdentitySection form={form} jenisArmada={jenisArmada} />
    ))
    fireEvent.change(screen.getByLabelText(label), { target: { value: typed } })
    expect(result.current.values[key as 'nopol']).toBe(expected)
  })

  // Requirement §1, seen from the operator's side: the separators disappear while they type.
  it('shows the plate tightened as it is typed', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    const input = screen.getByLabelText(/nomor polisi/i)
    fireEvent.change(input, { target: { value: 'b 9114-kyz' } })
    expect(input).toHaveValue('B9114KYZ')
  })

  it('shows the error the hook reported for a field', () => {
    const { result } = renderWithForm((form) => (
      <IdentitySection form={form} jenisArmada={jenisArmada} />
    ))
    act(() => {
      result.current.validate()
    })
    expect(screen.getByText(/nomor polisi wajib diisi/i)).toBeInTheDocument()
  })
})

describe('LeaseSection', () => {
  const renderLease = () =>
    renderWithForm((form) => (
      <LeaseSection form={form} kepemilikan={kepemilikan} leasing={leasing} />
    ))

  // Requirement §3: the section had two fields and needs eight.
  it('renders all eight ownership and lease fields', () => {
    renderLease()
    for (const label of [
      /status kepemilikan/i,
      /vendor sewa/i,
      /perusahaan leasing/i,
      /nomor kontrak/i,
      /cicilan/i,
      /total angsuran/i,
      /tanggal angsuran pertama/i,
      /angsuran sudah dibayar/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it.each([
    [/nomor kontrak/i, 'MTF-2024-03-11872', 'nomorKontrak'],
    [/cicilan/i, '8750000', 'cicilanPerBulan'],
    [/total angsuran/i, '36', 'tenorBulan'],
    [/tanggal angsuran pertama/i, '2026-01-10', 'angsuranMulai'],
    [/angsuran sudah dibayar/i, '4', 'angsuranTerbayar'],
  ])('writes %s through to the form state', (label, typed, key) => {
    const { result } = renderLease()
    fireEvent.change(screen.getByLabelText(label), { target: { value: typed } })
    expect(result.current.values[key as 'nomorKontrak']).toBe(typed)
  })

  // Requirement §2 marks this the one optional field on the section, and the asterisk is how an
  // operator knows it before pressing Simpan.
  it('marks angsuran sudah dibayar as the only optional field', () => {
    renderLease()
    expect(screen.getByText(/angsuran sudah dibayar/i).querySelector('[aria-hidden]')).toBeNull()
    expect(screen.getByText(/nomor kontrak/i).querySelector('[aria-hidden]')).not.toBeNull()
  })

  // Spec §5.1 bersyarat: the owner field only matters for a rented unit, and leaving it enabled
  // invites somebody to fill in a company that does not own the truck.
  it('disables the owner field until the unit is a rented one', () => {
    renderLease()
    expect(screen.getByLabelText(/vendor sewa/i)).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/status kepemilikan/i), { target: { value: 'kp-sewa' } })
    expect(screen.getByLabelText(/vendor sewa/i)).toBeEnabled()
  })

  // A unit bought outright has no contract to describe, so the four contract inputs are hidden
  // rather than left standing empty above a validator that no longer demands them.
  it('hides the four contract inputs once the unit names no financier', () => {
    renderLease()
    fireEvent.change(screen.getByLabelText(/perusahaan leasing/i), {
      target: { value: 'ls-lunas' },
    })
    for (const label of [
      /nomor kontrak/i,
      /cicilan/i,
      /total angsuran/i,
      /tanggal angsuran pertama/i,
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
    // Optional whether or not there is a contract, so it stays either way.
    expect(screen.getByLabelText(/angsuran sudah dibayar/i)).toBeInTheDocument()
  })

  it('keeps the contract inputs while the chosen leasing row is a real financier', () => {
    renderLease()
    fireEvent.change(screen.getByLabelText(/perusahaan leasing/i), { target: { value: 'ls1' } })
    expect(screen.getByLabelText(/nomor kontrak/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tanggal angsuran pertama/i)).toBeInTheDocument()
  })
})

describe('OperationalSection', () => {
  const renderOps = () =>
    renderWithForm((form) => (
      <OperationalSection form={form} pool={pool} status={status} drivers={drivers} />
    ))

  it('renders the operational fields', () => {
    renderOps()
    for (const label of [
      /sopir penanggung jawab/i,
      /nomor sim/i,
      /masa berlaku sim/i,
      /pool/i,
      /status kendaraan/i,
      /odometer/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('lists the drivers it was given', () => {
    renderOps()
    expect(screen.getByRole('option', { name: 'Ahmad Fauzi' })).toBeInTheDocument()
  })

  // Requirement #1 and spec §6: the licence is the driver's, held once in the Sopir module. The
  // form shows it and never stores a second copy.
  it('fills the SIM fields from the chosen driver', () => {
    renderOps()
    fireEvent.change(screen.getByLabelText(/sopir penanggung jawab/i), {
      target: { value: 'dr1' },
    })
    expect(screen.getByLabelText(/nomor sim/i)).toHaveValue('3201-1122-3344')
    expect(screen.getByLabelText(/masa berlaku sim/i)).toHaveValue('2027-03-14')
  })

  // Read-only, not merely unfilled: a licence typed per-vehicle is a second copy that drifts out
  // of step with the Sopir module the moment one of them is renewed.
  it('keeps the SIM fields read-only', () => {
    renderOps()
    expect(screen.getByLabelText(/nomor sim/i)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/masa berlaku sim/i)).toHaveAttribute('readonly')
  })

  it('shows empty SIM fields while no driver is chosen', () => {
    renderOps()
    expect(screen.getByLabelText(/nomor sim/i)).toHaveValue('')
  })

  it('writes the odometer through to the form state', () => {
    const { result } = renderOps()
    fireEvent.change(screen.getByLabelText(/odometer/i), { target: { value: '120000' } })
    expect(result.current.values.odometer).toBe('120000')
  })
})

describe('DocumentSection', () => {
  const stnk = [docTypes[0]]
  const servis = [docTypes[1]]

  it('renders a number, an issue date and an expiry per document type', () => {
    renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={stnk} />
    ))
    expect(screen.getByLabelText(/stnk nomor/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/stnk terbit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/masa berlaku stnk/i)).toBeInTheDocument()
  })

  // Requirement #2, the whole point of docLabels: a service record has a last date and a next
  // one. "Servis berkala terbit" and "Servis berkala berlaku sampai" read as nonsense.
  it('names the service dates for what they are', () => {
    renderWithForm((form) => (
      <DocumentSection title="Servis dan Perawatan" form={form} types={servis} showNomor={false} />
    ))
    expect(screen.getByLabelText(/servis berkala terakhir/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/servis berkala berikutnya/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/terbit/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/berlaku sampai/i)).not.toBeInTheDocument()
  })

  // A service record has no document number to type. Rendering one anyway asks the operator a
  // question with no answer.
  it('leaves the number field out when the section does not want one', () => {
    renderWithForm((form) => (
      <DocumentSection title="Servis dan Perawatan" form={form} types={servis} showNomor={false} />
    ))
    expect(screen.queryByLabelText(/nomor/i)).not.toBeInTheDocument()
  })

  it('writes each document field through to the form state', () => {
    const { result } = renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={stnk} />
    ))
    fireEvent.change(screen.getByLabelText(/stnk nomor/i), { target: { value: 'STNK-1' } })
    fireEvent.change(screen.getByLabelText(/stnk terbit/i), { target: { value: '2026-01-10' } })
    fireEvent.change(screen.getByLabelText(/masa berlaku stnk/i), {
      target: { value: '2031-01-10' },
    })
    expect(result.current.docRow('dt-stnk')).toEqual({
      nomor: 'STNK-1',
      issuedAt: '2026-01-10',
      expiresAt: '2031-01-10',
    })
  })

  // Spec §4.2: which documents are mandatory lives in master data, so the asterisk has to be read
  // off the row rather than hardcoded per section.
  it('marks the expiry required for a type flagged required', () => {
    renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={docTypes} />
    ))
    expect(screen.getByText(/masa berlaku stnk/i).querySelector('[aria-hidden]')).not.toBeNull()
    expect(screen.getByText(/servis berkala berikutnya/i).querySelector('[aria-hidden]')).toBeNull()
  })

  it('shows the error the hook reported against a required document', () => {
    const { result } = renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={docTypes} />
    ))
    act(() => {
      result.current.validate()
    })
    expect(screen.getByText(/masa berlaku stnk wajib diisi/i)).toBeInTheDocument()
  })

  // docTypes arrives from a query that has not resolved at first paint. A section that throws on
  // an empty list takes the whole dialog down with it.
  it('renders nothing but its heading while the types are still loading', () => {
    renderWithForm((form) => <DocumentSection title="Dokumen Kendaraan" form={form} types={[]} />)
    expect(screen.getByText('Dokumen Kendaraan')).toBeInTheDocument()
  })
})
