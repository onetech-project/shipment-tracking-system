/**
 * Added beyond the brief, which specifies no page spec. The page owns two pieces of logic that no
 * other test can reach: handleSubmit, which narrows an edit down to the three mutable columns, and
 * the delete handler, which is the only thing standing between a refused 409 and an unhandled
 * rejection with a silently-open dialog.
 *
 * Only the data hooks and the permission gate are mocked; DataTable, ConfirmDialog and
 * MasterDataFormDialog render for real so the wiring between them is what is under test.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetMasterDataPage from './page'
import { FleetMasterRow } from '@/features/fleet/types'

const mockHasPermission = jest.fn()
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}))

const mockUseFleetMasterData = jest.fn()
const mockCreate = jest.fn()
const mockUpdateAsync = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/features/fleet/hooks/useFleetMasterData', () => ({
  useFleetMasterData: (category: string) => mockUseFleetMasterData(category),
  useCreateFleetMasterData: () => ({ mutateAsync: mockCreate }),
  useUpdateFleetMasterData: () => ({ mutateAsync: mockUpdateAsync, mutate: mockUpdate }),
  useDeleteFleetMasterData: () => ({ mutateAsync: mockDelete }),
}))

const row: FleetMasterRow = {
  id: 'r1',
  category: 'jenis_armada',
  code: 'cdd',
  label: 'CDD',
  sortOrder: 10,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
}

describe('FleetMasterDataPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    mockUseFleetMasterData.mockReturnValue({ data: [row], isLoading: false })
    mockCreate.mockResolvedValue(undefined)
    mockUpdateAsync.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
  })

  const openDeleteDialog = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    return within(screen.getByRole('dialog'))
  }

  // The 409 carries the reference count and the advice to deactivate instead; a generic toast
  // would leave the operator with no idea which vehicles still point at the row.
  it('surfaces the backend refusal when a delete is rejected', async () => {
    mockDelete.mockRejectedValue({
      response: { data: { message: 'Masih dipakai oleh 3 kendaraan.' } },
    })
    render(<FleetMasterDataPage />)
    const dialog = openDeleteDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

    expect(await screen.findByText('Masih dipakai oleh 3 kendaraan.')).toBeInTheDocument()
  })

  // A transport failure carries no response body. Without the fallback the banner renders empty
  // and the row appears to have been deleted when it was not.
  it('falls back to a generic delete message when the failure carries no body', async () => {
    mockDelete.mockRejectedValue(new Error('Network Error'))
    render(<FleetMasterDataPage />)
    const dialog = openDeleteDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

    expect(await screen.findByText('Gagal menghapus data master.')).toBeInTheDocument()
  })

  it('deletes the row the operator confirmed', async () => {
    render(<FleetMasterDataPage />)
    const dialog = openDeleteDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('r1'))
  })

  // An edit PATCHes only the three mutable columns: category and code are the row's identity and
  // the backend refuses to change them, so sending them back would turn every save into a 400.
  it('sends only the mutable columns when editing, against the row id', async () => {
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'CDD Long' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockUpdateAsync).toHaveBeenCalledWith({
        id: 'r1',
        payload: { label: 'CDD Long', sortOrder: 10, warnDays: null },
      }),
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // The create path forwards the dialog's payload untouched. Asserted with a non-default sort
  // order against a bare object: with everything left at 0/null a dropped field is invisible.
  it('creates with the full payload including the active category', async () => {
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah Jenis Armada' }))
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Wingbox' } })
    fireEvent.change(screen.getByLabelText(/Urutan tampil/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        category: 'jenis_armada',
        code: 'wingbox',
        label: 'Wingbox',
        sortOrder: 5,
        warnDays: null,
      }),
    )
    expect(mockUpdateAsync).not.toHaveBeenCalled()
  })

  // Deactivating is the escape hatch a refused delete points at, so it has to flip the flag rather
  // than blindly write false — the same button reactivates a row that is already off.
  it('toggles the active flag to the opposite of the row it was clicked on', () => {
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'r1', payload: { isActive: false } })

    mockUpdate.mockClear()
    mockUseFleetMasterData.mockReturnValue({ data: [{ ...row, isActive: false }], isLoading: false })
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Aktifkan' })[0])
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'r1', payload: { isActive: true } })
  })

  // The tab is the only thing that selects which category the query and the create dialog use, so
  // a tab that changes the highlight without changing the fetch is a silently wrong screen.
  it('refetches and creates against the category whose tab is selected', async () => {
    render(<FleetMasterDataPage />)
    expect(mockUseFleetMasterData).toHaveBeenLastCalledWith('jenis_armada')

    fireEvent.click(screen.getByRole('tab', { name: 'Jenis Dokumen' }))
    expect(mockUseFleetMasterData).toHaveBeenLastCalledWith('jenis_dokumen')

    fireEvent.click(screen.getByRole('button', { name: '+ Tambah Jenis Dokumen' }))
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'KIR Tahunan' } })
    fireEvent.change(screen.getByLabelText(/Ambang peringatan/), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        category: 'jenis_dokumen',
        code: 'kir_tahunan',
        label: 'KIR Tahunan',
        sortOrder: 0,
        warnDays: 45,
      }),
    )
  })

  // Every category gets a tab: a missing one is a category an admin can never reach, and the
  // dropdown it feeds stays empty forever with no error anywhere.
  it('renders a tab for all eight categories', () => {
    render(<FleetMasterDataPage />)
    expect(screen.getAllByRole('tab')).toHaveLength(8)
  })

  it('hides the create, edit and delete controls without the matching permission', () => {
    mockHasPermission.mockReturnValue(false)
    render(<FleetMasterDataPage />)
    expect(screen.queryByRole('button', { name: /Tambah/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument()
  })

  // Master data is the one corner of this module with its own permission set — drivers, documents
  // and lease contracts deliberately share the vehicle set, so a copy-paste of *.fleet_vehicle from
  // drivers/page.tsx would silently hand every vehicle-permission holder destructive CRUD over the
  // rows feeding every dropdown in the module. Each slug is denied on its own so the assertion is
  // about which slug was asked for, not merely that some permission was consulted.
  it('gates the create button on create.fleet_master_data alone', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'create.fleet_master_data')
    render(<FleetMasterDataPage />)
    expect(screen.queryByRole('button', { name: /Tambah/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeInTheDocument()
  })

  it('gates the edit and toggle buttons on update.fleet_master_data alone', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'update.fleet_master_data')
    render(<FleetMasterDataPage />)
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Tambah Jenis Armada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeInTheDocument()
  })

  it('gates the delete button on delete.fleet_master_data alone', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'delete.fleet_master_data')
    render(<FleetMasterDataPage />)
    expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Tambah Jenis Armada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
  })

  // The table is the whole screen; nothing else tells the operator what a row holds. Cell text is
  // compared exactly rather than by substring so a hardcoded 0 cannot hide inside a '10'.
  it('renders each column of a row: label, code, sort order and threshold', () => {
    mockUseFleetMasterData.mockReturnValue({
      data: [{ ...row, code: 'kir', label: 'KIR Tahunan', sortOrder: 10, warnDays: 0 }],
      isLoading: false,
    })
    render(<FleetMasterDataPage />)

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Label',
      'Kode',
      'Urutan',
      'Ambang (hari)',
      '',
    ])

    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    // No badge on an active row, so the label cell is the label and nothing else.
    expect(cells[0].textContent).toBe('KIR Tahunan')
    expect(cells[1].textContent).toBe('kir')
    expect(cells[2].textContent).toBe('10')
    // 0 means "warn on the expiry date itself" — a real threshold, not an absent one. Rendering it
    // as the em dash used for null would tell the operator no threshold is set when one is.
    expect(cells[3].textContent).toBe('0')
  })

  it('renders the em dash only when the row genuinely has no threshold', () => {
    mockUseFleetMasterData.mockReturnValue({ data: [{ ...row, warnDays: null }], isLoading: false })
    render(<FleetMasterDataPage />)
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells[3].textContent).toBe('\u2014')
  })

  // The badge is the only signal a row is deactivated — without it the row looks live and the
  // 'Aktifkan' button reads as a mistake.
  it('marks a deactivated row with the nonaktif badge', () => {
    mockUseFleetMasterData.mockReturnValue({ data: [{ ...row, isActive: false }], isLoading: false })
    render(<FleetMasterDataPage />)
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    expect(within(cells[0]).getByText('nonaktif')).toBeInTheDocument()
  })

  // A table that ignores isLoading flashes "no data" on every tab switch, telling the operator a
  // category is empty while it is still being fetched.
  it('shows the loading row rather than the empty message while a category is fetching', () => {
    mockUseFleetMasterData.mockReturnValue({ data: undefined, isLoading: true })
    render(<FleetMasterDataPage />)
    expect(screen.getByText('Loading\u2026')).toBeInTheDocument()
    expect(screen.queryByText('Belum ada data untuk kategori ini.')).not.toBeInTheDocument()
  })

  it('tells the operator the category is empty once the fetch settles with no rows', () => {
    mockUseFleetMasterData.mockReturnValue({ data: [], isLoading: false })
    render(<FleetMasterDataPage />)
    expect(screen.getByText('Belum ada data untuk kategori ini.')).toBeInTheDocument()
  })

  it('titles the page and says what the master data feeds', () => {
    render(<FleetMasterDataPage />)
    expect(screen.getByRole('heading', { name: 'Master Data Armada' })).toBeInTheDocument()
    expect(
      screen.getByText('Daftar pilihan yang muncul di form kendaraan dan sopir.'),
    ).toBeInTheDocument()
  })

  // The description is the only place that tells the operator deactivating is the way out when the
  // backend refuses the delete with a 409, and it has to name the row being deleted.
  it('names the row and offers deactivation in the delete confirmation', () => {
    render(<FleetMasterDataPage />)
    const dialog = openDeleteDialog()
    expect(dialog.getByText('Hapus data master')).toBeInTheDocument()
    expect(
      dialog.getByText(
        'Hapus "CDD"? Kalau masih dipakai kendaraan, sistem akan menolak \u2014 nonaktifkan saja.',
      ),
    ).toBeInTheDocument()
  })

  // Exactly one tab is selected at a time: aria-selected on every tab tells a screen-reader user
  // that all eight categories are open at once, which is no information at all.
  it('marks only the active tab as selected', () => {
    render(<FleetMasterDataPage />)
    const selectedLabels = () =>
      screen
        .getAllByRole('tab')
        .filter((t) => t.getAttribute('aria-selected') === 'true')
        .map((t) => t.textContent)

    expect(selectedLabels()).toEqual(['Jenis Armada'])

    fireEvent.click(screen.getByRole('tab', { name: 'Jenis Dokumen' }))
    expect(selectedLabels()).toEqual(['Jenis Dokumen'])
  })
})
