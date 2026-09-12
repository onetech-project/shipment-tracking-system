import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetVehiclesPage from './page'
import { useFleetVehicles } from '@/features/fleet/hooks/useFleetVehicles'
import { FleetVehicle } from '@/features/fleet/types'

const mutations = {
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  restore: jest.fn().mockResolvedValue({}),
  documents: jest.fn().mockResolvedValue({}),
}

const refetchVehicles = jest.fn()
// The three fields every non-error case shares, so each test states only what makes it
// different.
const ok = { isLoading: false, isError: false, refetch: refetchVehicles }
let listResult: {
  data?: { rows: FleetVehicle[]; total: number; page: number; pageSize: number }
  isLoading: boolean
  isError: boolean
  refetch: jest.Mock
} = { data: { rows: [], total: 0, page: 1, pageSize: 25 }, ...ok }

jest.mock('@/features/fleet/hooks/useFleetVehicles', () => ({
  useFleetVehicles: jest.fn(() => listResult),
  useFleetVehicle: jest.fn(() => ({ data: undefined })),
  useCreateFleetVehicle: () => ({ mutateAsync: mutations.create }),
  useUpdateFleetVehicle: () => ({ mutateAsync: mutations.update }),
  useArchiveFleetVehicle: () => ({ mutateAsync: mutations.archive }),
  useRestoreFleetVehicle: () => ({ mutateAsync: mutations.restore }),
  useReplaceVehicleDocuments: () => ({ mutateAsync: mutations.documents }),
}))

// A jest.fn rather than an inline arrow, because the permission-gating tests assert on the
// second argument this page passes. Its signature is annotated rather than inferred: jest.fn
// takes its call signature from the implementation, and the implementation reads only the
// category, which would make every toHaveBeenCalledWith(category, opts) below a type error.
type MasterDataArgs = [string, ({ enabled?: boolean } | undefined)?]
const mockMasterData: jest.Mock<{ data: unknown[] }, MasterDataArgs> = jest.fn((category: string) => ({
  data: [{ id: `${category}-1`, category, code: 'c', label: `${category} satu`, sortOrder: 0, isActive: true, warnDays: 30, defaultValidMonths: null, isRequired: null }],
}))
jest.mock('@/features/fleet/hooks/useFleetDrivers', () => ({
  useFleetDrivers: () => ({ data: [{ id: 'dr1', nama: 'Ahmad Fauzi', isActive: true }] }),
  useFleetMasterDataByCategory: (category: string, opts?: { enabled?: boolean }) =>
    mockMasterData(category, opts),
}))

let permissions = [
  'read.fleet_vehicle',
  'create.fleet_vehicle',
  'update.fleet_vehicle',
  'delete.fleet_vehicle',
]
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissions.includes(p) }),
}))

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle =>
  ({
    id: 'v1',
    nopol: 'B9114KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    tahun: 2021,
    kapasitas: '8 ton',
    noRangka: 'MHM1234',
    noMesin: 'EN1234',
    noBpkb: 'BP1234',
    pemilikUnit: null,
    odometer: null,
    catatan: null,
    jenisArmada: { id: 'jenis_armada-1', label: 'jenis_armada satu' },
    kepemilikan: { id: 'kepemilikan-1', label: 'kepemilikan satu' },
    pool: { id: 'pool-1', label: 'pool satu' },
    status: null,
    driver: null,
    // The edit dialog seeds its lease fields from here, and Task 13 makes every one of them
    // except angsuranTerbayar required — an edit over a lease-less fixture could not be saved.
    lease: {
      id: 'lc1',
      leasing: { id: 'leasing-1', label: 'leasing satu' },
      nomorKontrak: 'MTF-1',
      cicilanPerBulan: 8750000,
      tenorBulan: 36,
      angsuranMulai: '2026-01-10',
      angsuranTerbayarOverride: null,
      angsuranTerbayar: 8,
      sisaAngsuran: 28,
      sisaKewajiban: 245000000,
    },
    documents: [],
    worstSeverity: 'none',
    minDaysLeft: null,
    isActive: true,
    ...over,
  }) as FleetVehicle

// Task 13 gates Simpan behind sixteen required fields, so a create test can no longer type one
// plate and submit. Filled through the labels rather than by reaching into state, because what
// is being proven is that the dialog's own fields reach the mutation.
const fillRequired = (nopol = 'B1A') => {
  const dialog = within(screen.getByRole('dialog'))
  const type = (label: RegExp | string, value: string) =>
    fireEvent.change(dialog.getByLabelText(label), { target: { value } })
  type(/nomor polisi/i, nopol)
  type(/^merk/i, 'Mitsubishi')
  type(/^tipe/i, 'Canter')
  type(/jenis armada/i, 'jenis_armada-1')
  type(/tahun pembuatan/i, '2021')
  type(/kapasitas/i, '8 ton')
  type(/nomor rangka/i, 'MHM1234')
  type(/nomor mesin/i, 'EN1234')
  type(/nomor bpkb/i, 'BP1234')
  type(/status kepemilikan unit/i, 'kepemilikan-1')
  type(/perusahaan leasing/i, 'leasing-1')
  type(/nomor kontrak/i, 'MTF-1')
  type(/cicilan/i, '8750000')
  type(/total angsuran/i, '36')
  type(/tanggal angsuran pertama/i, '2026-01-10')
  type(/pool/i, 'pool-1')
  // The seeded jenis_dokumen row carries isRequired: null, so no document row blocks the save.
}

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks leaves implementations in place, so the paging test's per-filter
  // implementation would otherwise leak into every test after it.
  ;(useFleetVehicles as jest.Mock).mockImplementation(() => listResult)
  permissions = [
    'read.fleet_vehicle',
    'create.fleet_vehicle',
    'update.fleet_vehicle',
    'delete.fleet_vehicle',
  ]
  listResult = {
    data: { rows: [vehicle()], total: 1, page: 1, pageSize: 25 },
    ...ok,
  }
})

describe('FleetVehiclesPage', () => {
  it('renders the vehicle rows', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
  })

  it('shows the page title', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('heading', { name: /armada/i })).toBeInTheDocument()
  })

  it('opens the create dialog from the header button', () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  // Hiding the button is the whole point of the permission — showing it and failing on submit
  // teaches the operator the app is broken rather than that they lack access.
  it('hides the add button without the create permission', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.queryByRole('button', { name: /tambah armada/i })).not.toBeInTheDocument()
  })

  // Dokumen is gated by the same update permission as Ubah, and the page also swaps its handler
  // for a no-op at that permission. Showing it to a read-only operator therefore gives them a
  // live-looking button that silently does nothing when clicked.
  it('hides the row actions without the matching permissions', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.queryByRole('button', { name: /aksi/i })).not.toBeInTheDocument()
  })

  it('saves a new vehicle through the create mutation', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    fillRequired('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      // Normalised on the way in (Task 11), so what reaches the mutation is the tight form.
      expect(mutations.create).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B1A' })),
    )
  })

  // The combined payload is the point of Task 8: one mutation carries the unit, its lease and
  // its documents, so a half-saved unit is not a state the operator can reach.
  it('sends the lease contract in the same create payload', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(mutations.create).toHaveBeenCalled())
    expect(mutations.create.mock.calls[0][0].lease).toEqual(
      expect.objectContaining({
        leasingId: 'leasing-1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
      }),
    )
  })

  // The row actions live in a ⋮ menu since Task 17, so every row-action test opens it first.
  // Radix opens on pointerdown guarded by button === 0, so fireEvent.click leaves it shut.
  const openRowMenu = (index = 0) =>
    fireEvent(
      screen.getAllByRole('button', { name: /aksi/i })[index],
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    )

  const clickRowAction = (name: string, index = 0) => {
    openRowMenu(index)
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }

  it('saves an edit through the update mutation with the row id', async () => {
    render(<FleetVehiclesPage />)
    clickRowAction('Ubah')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' })),
    )
  })

  // Both dialogs seed their form state in useState initialisers, which run once per mount, and
  // create/edit share a single mount condition with no key. The unmount on close is therefore
  // the only thing that makes the second open show the second unit rather than the first.
  it('seeds the edit dialog from the row that was opened, not the previous one', () => {
    listResult = {
      data: {
        rows: [vehicle(), vehicle({ id: 'v2', nopol: 'D4567XY' })],
        total: 2,
        page: 1,
        pageSize: 25,
      },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    clickRowAction('Ubah', 0)
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('B9114KYZ')
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    clickRowAction('Ubah', 1)
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('D4567XY')
  })

  it('saves documents through the replace mutation', async () => {
    render(<FleetVehiclesPage />)
    clickRowAction('Dokumen')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.documents).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', documents: [] }),
      ),
    )
  })

  // Pins the `> 0` half of the documents gate, which the positive case above cannot reach.
  // The dialog builds its replace payload from the rows it renders, and the backend's PUT
  // retires every document absent from that payload — so mounted over an empty docTypes it
  // would show zero rows above a live Simpan, and one click would retire every document on
  // the unit. The gate must therefore stay closed when jenis_dokumen comes back empty.
  it('does not open the documents dialog when no document types are configured', () => {
    // beforeEach clears calls but not implementations, and it restores only useFleetVehicles,
    // so this override restores itself rather than leaking into the tests that follow.
    const defaultMasterData = mockMasterData.getMockImplementation()
    mockMasterData.mockImplementation((category: string) => ({
      data:
        category === 'jenis_dokumen'
          ? []
          : [{ id: `${category}-1`, category, code: 'c', label: `${category} satu`, sortOrder: 0, isActive: true, warnDays: 30, defaultValidMonths: null, isRequired: null }],
    }))
    try {
      render(<FleetVehiclesPage />)
      clickRowAction('Dokumen')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // The page renders nothing at all in this state, so there is no live Simpan to click.
      expect(screen.queryByRole('button', { name: /simpan/i })).not.toBeInTheDocument()
    } finally {
      mockMasterData.mockImplementation(defaultMasterData!)
    }
  })

  // The row button and the dialog's confirm button are both called "Arsipkan", so the confirm
  // click is scoped to the dialog — the same shape the drivers page spec uses.
  const openArchiveDialog = () => {
    clickRowAction('Arsipkan')
    return within(screen.getByRole('dialog'))
  }

  // Archiving is not undoable from the operator's seat without finding the row again, so it
  // asks first.
  it('confirms before archiving', async () => {
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    expect(mutations.archive).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Arsipkan' }))
    await waitFor(() => expect(mutations.archive).toHaveBeenCalledWith('v1'))
  })

  it('names the vehicle in the confirmation', () => {
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    expect(dialog.getByText(/B9114KYZ/)).toBeInTheDocument()
  })

  // A failed archive must say why. The backend's 409 names the reason and the ConfirmDialog does
  // not catch, so an uncaught rejection would leave the operator with a dialog that just closed.
  it('shows the backend message when archiving fails', async () => {
    mutations.archive.mockRejectedValueOnce({
      response: { data: { message: 'Kendaraan masih terpakai' } },
    })
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Arsipkan' }))
    expect(await screen.findByText(/masih terpakai/i)).toBeInTheDocument()
  })

  it('restores an archived row without confirming', async () => {
    listResult = {
      data: { rows: [vehicle({ isActive: false })], total: 1, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    clickRowAction('Pulihkan')
    await waitFor(() => expect(mutations.restore).toHaveBeenCalledWith('v1'))
  })

  // Restore has no confirmation dialog to hold the operator's attention, so a rejection with
  // nothing rendered is indistinguishable from success: the row stays archived, the screen says
  // nothing, and the unit looks deleted. The backend really returns 409 here when another unit
  // has taken the plate in the meantime, and it names the plate in the message.
  it('shows the backend message when restoring fails', async () => {
    mutations.restore.mockRejectedValueOnce({
      response: { data: { message: 'Nopol sudah dipakai unit lain' } },
    })
    listResult = {
      data: { rows: [vehicle({ isActive: false })], total: 1, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    clickRowAction('Pulihkan')
    expect(await screen.findByText(/sudah dipakai unit lain/i)).toBeInTheDocument()
  })

  it('reports the total and the current page', () => {
    listResult = {
      data: { rows: [vehicle()], total: 87, page: 2, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/87/)).toBeInTheDocument()
    expect(screen.getByText(/halaman 2 dari 4/i)).toBeInTheDocument()
  })

  // The page it displays is the page the server answered with, not the one the filter asked
  // for, so the flat mock above can never advance past 1. This one echoes the requested page
  // back the way the real query does once the refetch lands.
  it('moves to the next page', () => {
    ;(useFleetVehicles as jest.Mock).mockImplementation((f: { page?: number }) => ({
      data: { rows: [vehicle()], total: 87, page: f.page ?? 1, pageSize: 25 },
      ...ok,
    }))
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    expect(screen.getByText(/halaman 2 dari 4/i)).toBeInTheDocument()
  })

  // Sebelumnya was only ever asserted disabled, so its handler was free to do anything at all.
  // An operator on page 3 who clicks Back must land on page 2: a sign flip or a copy-paste from
  // Berikutnya walks them forward instead, past rows they have not read.
  it('moves to the previous page', () => {
    ;(useFleetVehicles as jest.Mock).mockImplementation((f: { page?: number }) => ({
      data: { rows: [vehicle()], total: 87, page: f.page ?? 1, pageSize: 25 },
      ...ok,
    }))
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    expect(screen.getByText(/halaman 3 dari 4/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sebelumnya/i }))
    expect(screen.getByText(/halaman 2 dari 4/i)).toBeInTheDocument()
    expect(useFleetVehicles).toHaveBeenLastCalledWith({ page: 2, sort: 'nopol' })
  })

  // Re-sorting without resetting the page hands the operator page 3 of a brand-new ordering — a
  // different slice of units entirely, with nothing on screen saying the rows moved underneath
  // them. VehicleFilters forces the same reset for filter changes; the sort is the same hazard.
  it('resets to the first page when the sort changes', () => {
    ;(useFleetVehicles as jest.Mock).mockImplementation((f: { page?: number }) => ({
      data: { rows: [vehicle()], total: 87, page: f.page ?? 1, pageSize: 25 },
      ...ok,
    }))
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    expect(useFleetVehicles).toHaveBeenLastCalledWith({ page: 3, sort: 'nopol' })
    fireEvent.click(screen.getByRole('button', { name: 'Tahun' }))
    expect(useFleetVehicles).toHaveBeenLastCalledWith({ page: 1, sort: 'tahun' })
    expect(screen.getByText(/halaman 1 dari 4/i)).toBeInTheDocument()
  })

  // Paging past either end asks the backend for a page that does not exist and shows an empty
  // table, which reads as data loss.
  it('disables Previous on the first page', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('button', { name: /sebelumnya/i })).toBeDisabled()
  })

  it('disables Next on the last page', () => {
    listResult = {
      data: { rows: [vehicle()], total: 10, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('button', { name: /berikutnya/i })).toBeDisabled()
  })

  it('shows at least one page even with no results', () => {
    listResult = {
      data: { rows: [], total: 0, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/halaman 1 dari 1/i)).toBeInTheDocument()
  })

  it('passes the loading state down to the table', () => {
    listResult = { data: undefined, isLoading: true, isError: false, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  // A failed load must not render the empty-state copy: "Belum ada armada yang cocok" is an
  // affirmative claim that no unit matches, and an operator who believes it during an outage
  // starts re-registering units that already exist.
  it('reports a failed load instead of an empty table', () => {
    listResult = { data: undefined, isLoading: false, isError: true, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/gagal memuat data armada/i)).toBeInTheDocument()
    expect(screen.queryByText(/belum ada armada/i)).not.toBeInTheDocument()
  })

  it('retries a failed load on demand', () => {
    listResult = { data: undefined, isLoading: false, isError: true, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }))
    expect(refetchVehicles).toHaveBeenCalled()
  })

  // Spec §7's field-operator persona: read.fleet_vehicle without read.fleet_master_data. Five
  // unconditional master-data queries would be five guaranteed 403s and five empty dropdowns
  // with no explanation.
  it('does not query master data without read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('jenis_armada', { enabled: false })
    expect(mockMasterData).toHaveBeenCalledWith('jenis_dokumen', { enabled: false })
  })

  it('queries master data with read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('jenis_armada', { enabled: true })
  })

  it('explains why the lookup lists are empty', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/butuh izin akses master data/i)).toBeInTheDocument()
  })

  it('does not explain anything when the lists are available', () => {
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetVehiclesPage />)
    expect(screen.queryByText(/butuh izin akses master data/i)).not.toBeInTheDocument()
  })

  // The suite proves the five lookup queries fire; this proves their answers land in the right
  // field. A cross-wire renders four fully populated dropdowns that are all quietly wrong — the
  // operator picks a pool from the Kepemilikan list and registers the unit against it. Each mock
  // label carries its own category name, so reading the options under each label catches a swap.
  it('feeds each master-data list to its own field in the create dialog', () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    // Scoped to the dialog: the filter bar behind it carries its own Kepemilikan, Pool and
    // Status unit selects fed from the same three queries.
    const dialog = within(screen.getByRole('dialog'))
    const optionsOf = (label: RegExp | string) =>
      Array.from(dialog.getByLabelText(label).querySelectorAll('option')).map((o) => o.textContent)
    expect(optionsOf(/jenis armada/i)).toEqual(['— pilih —', 'jenis_armada satu'])
    expect(optionsOf(/status kepemilikan unit/i)).toEqual(['— pilih —', 'kepemilikan satu'])
    expect(optionsOf(/pool/i)).toEqual(['— pilih —', 'pool satu'])
    expect(optionsOf(/status kendaraan/i)).toEqual(['— pilih —', 'status_kendaraan satu'])
    expect(optionsOf(/perusahaan leasing/i)).toEqual(['— pilih —', 'leasing satu'])
    expect(optionsOf(/sopir penanggung jawab/i)).toEqual(['— pilih —', 'Ahmad Fauzi'])
  })

  // The dialog test above scopes every query to role="dialog" and so cannot see the filter bar,
  // which is fed from the same three queries at a second call site. A cross-wire there is
  // invisible from the operator's seat: they narrow by Pool and the list silently narrows by
  // owner instead, so the page looks like it answered and did not.
  it('feeds each master-data list to its own filter dropdown', () => {
    render(<FleetVehiclesPage />)
    // No dialog is open here, so each label resolves to the filter bar's own select.
    const optionsOf = (label: string) =>
      Array.from(screen.getByLabelText(label).querySelectorAll('option')).map((o) => o.textContent)
    expect(optionsOf('Kepemilikan')).toEqual(['Semua kepemilikan', 'kepemilikan satu'])
    expect(optionsOf('Pool')).toEqual(['Semua pool', 'pool satu'])
    expect(optionsOf('Status unit')).toEqual(['Semua status', 'status_kendaraan satu'])
  })

  // onChange is the only wire between the filter bar and the page's filter state. Cut it and
  // every control still renders and still looks live, but the table never narrows. Asserting the
  // query arguments rather than the select's own value is what catches that — a controlled select
  // whose onChange goes nowhere simply never updates, so its value proves nothing about the page.
  it('sends a changed filter to the vehicle query', () => {
    render(<FleetVehiclesPage />)
    fireEvent.change(screen.getByLabelText('Kepemilikan'), {
      target: { value: 'kepemilikan-1' },
    })
    expect(useFleetVehicles).toHaveBeenLastCalledWith({
      page: 1,
      sort: 'nopol',
      kepemilikanId: 'kepemilikan-1',
    })
  })

  // The leasing list is the sixth master-data query and the only new one. Without it the
  // Perusahaan leasing select renders empty and a required field has no reachable value.
  it('queries the leasing master data under the same permission', () => {
    // beforeEach grants the four vehicle permissions but not this one, so it is named here the
    // same way 'queries master data with read.fleet_master_data' names it.
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('leasing', { enabled: true })
  })

  it('does not query the leasing list without read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('leasing', { enabled: false })
  })

  // jenis_dokumen already had a query, feeding the standalone documents dialog. What is new is
  // that the form dialog needs it too: sections 4-6 are built from it, so a form that does not
  // receive it renders three empty sections and silently drops every document on save.
  it('feeds the leasing and document lists to the form dialog', () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    const dialog = within(screen.getByRole('dialog'))
    const optionsOf = (label: RegExp | string) =>
      Array.from(dialog.getByLabelText(label).querySelectorAll('option')).map((o) => o.textContent)
    expect(optionsOf(/perusahaan leasing/i)).toEqual(['— pilih —', 'leasing satu'])
    // The document type's own label proves jenisDokumen reached the dialog: its row is rendered
    // from the master row, not from anything the vehicle carries.
    expect(dialog.getByLabelText(/jenis_dokumen satu.*berlaku/i)).toBeInTheDocument()
  })

  // The table's document columns are built from the same list. Passed nothing it falls back to
  // its fixed columns and the operator loses every expiry date off the list — the one thing
  // requirement #4 asked for.
  it('feeds the document types to the table columns', () => {
    render(<FleetVehiclesPage />)
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toContain('jenis_dokumen satu')
  })
})
