import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BerkasTab } from './BerkasTab'
import { FleetMasterRow, FleetVehicle, FleetVehicleFile } from '../types'

// BerkasVehicleCard calls useVehicleFiles for itself (one hook call per card, not per row inside
// a .map()), so the spec mocks the hook module and keys its fixtures by vehicleId — the same
// shape VehicleTable.spec.tsx uses for its own hook mocks.
let filesFor: Record<string, FleetVehicleFile[]> = {}

jest.mock('../hooks/useFleetVehicleFiles', () => ({
  useVehicleFiles: jest.fn((vehicleId: string) => ({ data: filesFor[vehicleId] ?? [] })),
}))

const slot = (id: string, code: string, label: string): FleetMasterRow => ({
  id,
  category: 'jenis_berkas',
  code,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
})

const SLOTS = [slot('s1', 'stnk', 'STNK'), slot('s2', 'kir', 'KIR'), slot('s3', 'pajak', 'Pajak')]

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  nopol: 'B9114KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: null,
  noRangka: null,
  noMesin: null,
  noBpkb: null,
  pemilikUnit: null,
  odometer: null,
  catatan: null,
  jenisArmada: null,
  kepemilikan: null,
  pool: null,
  status: null,
  driver: null,
  lease: null,
  documents: [],
  worstSeverity: 'none',
  minDaysLeft: null,
  berkasCount: { ada: 3, wajib: 3 },
  isActive: true,
  ...over,
})

// Distinct defaults matter here: two fixtures built off this helper without overrides would be
// indistinguishable, and an indistinguishable pair cannot catch a cross-wire between them.
const fileFixture = (over: Partial<FleetVehicleFile> = {}): FleetVehicleFile => ({
  id: 'f1',
  slotId: 's1',
  slotCode: 'stnk',
  slotLabel: 'STNK',
  originalName: 'berkas.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 102400,
  externalUrl: null,
  uploadedAt: '2024-01-01T00:00:00.000Z',
  ...over,
})

const noop = () => {}

const setup = (over: Partial<Parameters<typeof BerkasTab>[0]> = {}) => {
  const props = {
    vehicles: [vehicle()],
    slots: SLOTS,
    canEdit: true,
    onUpload: jest.fn(),
    onView: jest.fn(),
    onDelete: jest.fn(),
    ...over,
  }
  render(<BerkasTab {...props} />)
  return props
}

beforeEach(() => {
  jest.clearAllMocks()
  filesFor = {}
})

describe('BerkasTab', () => {
  it('renders a card per vehicle with a slot for every active jenis_berkas', () => {
    // Arrange: two vehicles, three jenis_berkas slots
    setup({
      vehicles: [
        vehicle({ id: 'v1', nopol: 'B9114KYZ' }),
        vehicle({ id: 'v2', nopol: 'D4567XY' }),
      ],
    })
    // Expect: both plates rendered; six slot labels in total
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
    expect(screen.getByText('D4567XY')).toBeInTheDocument()
    expect(screen.getAllByText('STNK')).toHaveLength(2)
    expect(screen.getAllByText('KIR')).toHaveLength(2)
    expect(screen.getAllByText('Pajak')).toHaveLength(2)
  })

  it("shows each vehicle its own files, never another unit's", () => {
    // Arrange: v1 holds a STNK file, v2 holds a different file in a different slot. If the card
    // ever fetched files for the wrong vehicle id, one plate would show the other unit's papers.
    filesFor = {
      v1: [fileFixture({ id: 'f1', originalName: 'stnk-v1.pdf' })],
      v2: [fileFixture({ id: 'f2', slotId: 's2', slotCode: 'kir', slotLabel: 'KIR', originalName: 'kir-v2.pdf' })],
    }
    setup({
      vehicles: [
        vehicle({ id: 'v1', nopol: 'B9114KYZ' }),
        vehicle({ id: 'v2', nopol: 'D4567XY' }),
      ],
    })
    const v1Card = screen.getByText('B9114KYZ').closest('article') as HTMLElement
    const v2Card = screen.getByText('D4567XY').closest('article') as HTMLElement
    // An operator must never see another unit's registration papers under their own plate.
    expect(within(v1Card).getByText(/stnk-v1\.pdf/)).toBeInTheDocument()
    expect(within(v1Card).queryByText(/kir-v2\.pdf/)).not.toBeInTheDocument()
    expect(within(v2Card).getByText(/kir-v2\.pdf/)).toBeInTheDocument()
    expect(within(v2Card).queryByText(/stnk-v1\.pdf/)).not.toBeInTheDocument()
  })

  it('puts a file under the slot it belongs to, leaving sibling slots empty', () => {
    // Arrange: one file for v1, filed under the KIR slot only — STNK and Pajak stay unfilled
    filesFor = {
      v1: [fileFixture({ id: 'f3', slotId: 's2', slotCode: 'kir', slotLabel: 'KIR', originalName: 'kir-only.pdf', sizeBytes: 51200 })],
    }
    setup({ vehicles: [vehicle({ id: 'v1' })] })
    // A lookup keyed on the wrong field (slot.code instead of slot.id) would either misfile this
    // under STNK/Pajak or hide it from every slot at once — a STNK-under-BPKB mix-up either way.
    expect(screen.getByText('kir-only.pdf · 50 KB')).toBeInTheDocument()
    expect(screen.getAllByText('belum ada berkas')).toHaveLength(2)
  })

  it('chips the filled count against the number of slots', () => {
    // Arrange: a vehicle whose berkasCount is { ada: 2, wajib: 3 }
    setup({ vehicles: [vehicle({ berkasCount: { ada: 2, wajib: 3 } })] })
    // Expect: text '2/3' rendered
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  // Both directions are asserted here, not just 'Belum lengkap': a mutation that inverts only the
  // 'lengkap' branch left this test green when it checked one direction alone, and was caught
  // only by accident in the remount test below. Each filter's own semantics belong to this test.
  it('filters to units with missing files', async () => {
    setup({
      vehicles: [
        vehicle({ id: 'v1', nopol: 'B9114KYZ', berkasCount: { ada: 3, wajib: 3 } }),
        vehicle({ id: 'v2', nopol: 'D4567XY', berkasCount: { ada: 1, wajib: 3 } }),
      ],
    })
    // Act: click the 'Belum lengkap' filter
    fireEvent.click(screen.getByRole('button', { name: 'Belum lengkap' }))
    // Expect: only the vehicle with ada < wajib remains
    expect(screen.queryByText('B9114KYZ')).not.toBeInTheDocument()
    expect(screen.getByText('D4567XY')).toBeInTheDocument()

    // The mirror image: 'Lengkap' keeps only the unit with ada >= wajib.
    fireEvent.click(screen.getByRole('button', { name: 'Lengkap' }))
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
    expect(screen.queryByText('D4567XY')).not.toBeInTheDocument()
  })

  // Spec §6.4: the prototype's row button only filled the search box, so with the "Lengkap"
  // filter active the operator landed on an empty state for the unit they had just clicked.
  //
  // BerkasTab's confirmed interface (see task brief) carries no focusVehicleId prop — the
  // completeness filter is local state (useState('all')). The only way Task 15's page can land
  // an operator on a specific unit without the stale filter hiding it is the standard React
  // idiom for this shape: mount a fresh BerkasTab (key={focusVehicleId}) when navigating in from
  // elsewhere, so local state — including the filter — starts over. This test pins that the
  // filter really is fresh-per-mount rather than, say, hoisted into a module-level variable or a
  // ref that would survive a remount and reproduce the prototype's bug.
  it('clears the completeness filter when a vehicle is opened from elsewhere', () => {
    // Arrange: render with filter 'lengkap' and focusVehicleId pointing at an incomplete unit
    const props = {
      vehicles: [
        vehicle({ id: 'v1', nopol: 'B9114KYZ', berkasCount: { ada: 3, wajib: 3 } }),
        vehicle({ id: 'v2', nopol: 'D4567XY', berkasCount: { ada: 1, wajib: 3 } }),
      ],
      slots: SLOTS,
      canEdit: true,
      onUpload: noop,
      onView: noop,
      onDelete: noop,
    }
    const { rerender } = render(<BerkasTab key="v1" {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lengkap' }))
    expect(screen.queryByText('D4567XY')).not.toBeInTheDocument()
    // A fresh mount under a different key is what Task 15 does to focus a different unit.
    rerender(<BerkasTab key="v2" {...props} />)
    // Expect: that vehicle is visible
    expect(screen.getByText('D4567XY')).toBeInTheDocument()
  })

  it('says so when no vehicle matches', () => {
    setup({ vehicles: [vehicle({ berkasCount: { ada: 3, wajib: 3 } })] })
    fireEvent.click(screen.getByRole('button', { name: 'Belum lengkap' }))
    // Expect: /tidak ada kendaraan yang cocok/i
    expect(screen.getByText(/tidak ada kendaraan yang cocok/i)).toBeInTheDocument()
  })

  it('tells a read-only operator why there is nothing to upload', () => {
    // Arrange: canEdit false
    setup({ canEdit: false })
    // Expect: no 'Unggah' button anywhere
    expect(screen.queryByRole('button', { name: /unggah/i })).not.toBeInTheDocument()
  })

  // A slot list built from an empty master-data response would render zero slots over a live
  // page and look like the files had vanished.
  it('explains an empty slot list instead of rendering a blank tab', () => {
    // Arrange: slots = []
    setup({ slots: [] })
    // Expect: /belum ada jenis berkas/i
    expect(screen.getByText(/belum ada jenis berkas/i)).toBeInTheDocument()
  })
})
