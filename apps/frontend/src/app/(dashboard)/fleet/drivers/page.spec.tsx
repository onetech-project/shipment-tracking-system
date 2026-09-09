/**
 * The drivers page shipped with no spec, and the gap was load bearing: collapsing handleSubmit's
 * create/edit branch into a single createDriver.mutateAsync(payload) survived the full frontend
 * suite and tsc --noEmit, which means every "Ubah sopir" save would have created a duplicate driver
 * instead of updating one, silently.
 *
 * Only the data hooks and the permission gate are mocked; DataTable, ConfirmDialog and
 * DriverFormDialog render for real, so the wiring between them is what is under test.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetDriversPage from './page'
import { FleetDriver, FleetMasterRow } from '@/features/fleet/types'

const mockHasPermission = jest.fn()
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}))

const mockUseFleetDrivers = jest.fn()
const mockUseSimTypes = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/features/fleet/hooks/useFleetDrivers', () => ({
  useFleetDrivers: (params: unknown) => mockUseFleetDrivers(params),
  useFleetMasterDataByCategory: (category: string) => mockUseSimTypes(category),
  useCreateFleetDriver: () => ({ mutateAsync: mockCreate }),
  useUpdateFleetDriver: () => ({ mutateAsync: mockUpdate }),
  useDeleteFleetDriver: () => ({ mutateAsync: mockDelete }),
}))

const driver: FleetDriver = {
  id: 'd1',
  nama: 'Budi',
  telepon: '0812',
  simNomor: 'SIM-9',
  simJenisId: 's1',
  simJenis: { id: 's1', label: 'B1 Umum' },
  simExpiresAt: '2027-01-31',
  isActive: true,
}

const simType: FleetMasterRow = {
  id: 's1',
  category: 'jenis_sim',
  code: 'b1_umum',
  label: 'B1 Umum',
  sortOrder: 0,
  isActive: true,
  warnDays: 30,
  defaultValidMonths: null,
  isRequired: null,
}

describe('FleetDriversPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    mockUseFleetDrivers.mockReturnValue({ data: [driver], isLoading: false })
    mockUseSimTypes.mockReturnValue({ data: [simType] })
    mockCreate.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
  })

  const openDeleteDialog = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    return within(screen.getByRole('dialog'))
  }

  describe('the create/edit branch', () => {
    // The mutation that started this file: `if (modal?.type === 'edit')` collapsed so both arms
    // call createDriver. Asserting the update call alone would not catch it — the create assertion
    // in the same test is what fails, so both halves are pinned in each direction.
    it('updates the driver being edited rather than creating a new one', async () => {
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
      fireEvent.change(screen.getByLabelText(/Nama sopir/), {
        target: { value: 'Budi Santoso' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({
          id: 'd1',
          payload: {
            nama: 'Budi Santoso',
            telepon: '0812',
            simNomor: 'SIM-9',
            simJenisId: 's1',
            simExpiresAt: '2027-01-31',
          },
        }),
      )
      // Without this the collapsed branch passes: an edit that creates still "saved something".
      expect(mockCreate).not.toHaveBeenCalled()
    })

    // The mirror image: the create arm collapsed into updateDriver. Asserted with a full payload
    // against a bare object literal so a dropped or hardcoded-null field cannot slip through.
    it('creates a new driver rather than updating an existing one', async () => {
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: '+ Tambah sopir' }))
      fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Siti' } })
      fireEvent.change(screen.getByLabelText(/Nomor telepon/), { target: { value: '0899' } })
      fireEvent.change(screen.getByLabelText(/Nomor SIM/), { target: { value: 'SIM-42' } })
      fireEvent.change(screen.getByLabelText(/Jenis SIM/), { target: { value: 's1' } })
      fireEvent.change(screen.getByLabelText(/Masa berlaku SIM/), {
        target: { value: '2028-06-30' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

      await waitFor(() =>
        expect(mockCreate).toHaveBeenCalledWith({
          nama: 'Siti',
          telepon: '0899',
          simNomor: 'SIM-42',
          simJenisId: 's1',
          simExpiresAt: '2028-06-30',
        }),
      )
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    // The edit dialog must open seeded with the row's own values: a dialog that opens blank turns
    // an edit of one field into a wipe of every other, since the form sends all five every time.
    it('seeds the edit form with the driver that was clicked', () => {
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))

      expect(screen.getByLabelText(/Nama sopir/)).toHaveValue('Budi')
      expect(screen.getByLabelText(/Nomor telepon/)).toHaveValue('0812')
      expect(screen.getByLabelText(/Nomor SIM/)).toHaveValue('SIM-9')
      expect(screen.getByLabelText(/Jenis SIM/)).toHaveValue('s1')
      expect(screen.getByLabelText(/Masa berlaku SIM/)).toHaveValue('2027-01-31')
      expect(screen.getByRole('heading', { name: 'Ubah sopir' })).toBeInTheDocument()
    })

    // The create dialog must NOT be seeded from whichever row happened to be rendered.
    it('opens the create form blank', () => {
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: '+ Tambah sopir' }))

      expect(screen.getByLabelText(/Nama sopir/)).toHaveValue('')
      expect(screen.getByLabelText(/Nomor telepon/)).toHaveValue('')
      expect(screen.getByRole('heading', { name: 'Tambah sopir' })).toBeInTheDocument()
    })

    // The Jenis SIM select is the only consumer of the jenis_sim category. A page that passed the
    // wrong category would render an empty dropdown and the field would be unfillable.
    it('feeds the SIM type dropdown from the jenis_sim category', () => {
      render(<FleetDriversPage />)
      expect(mockUseSimTypes).toHaveBeenCalledWith('jenis_sim')

      fireEvent.click(screen.getByRole('button', { name: '+ Tambah sopir' }))
      const options = within(screen.getByLabelText(/Jenis SIM/)).getAllByRole('option')
      expect(options.map((o) => o.textContent)).toEqual(['— pilih —', 'B1 Umum'])
    })
  })

  describe('search', () => {
    // The box is the only filter on the page; a query that ignores it returns the full list and
    // the box reads as broken.
    it('passes the typed search term to the driver query', () => {
      render(<FleetDriversPage />)
      expect(mockUseFleetDrivers).toHaveBeenLastCalledWith({ q: '' })

      fireEvent.change(screen.getByLabelText('Cari sopir'), { target: { value: 'Budi' } })
      expect(mockUseFleetDrivers).toHaveBeenLastCalledWith({ q: 'Budi' })
    })
  })

  describe('permissions', () => {
    // Drivers deliberately share the VEHICLE permission set — whoever registers a vehicle also
    // assigns its driver — while master data keeps its own *.fleet_master_data set. Each slug is
    // denied on its own so the assertion is about which slug was asked for, not merely that some
    // permission was consulted: a page reading create.fleet_master_data here would still gate.
    it('gates the create button on create.fleet_vehicle alone', () => {
      mockHasPermission.mockImplementation((p: string) => p !== 'create.fleet_vehicle')
      render(<FleetDriversPage />)
      expect(screen.queryByRole('button', { name: /Tambah/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hapus' })).toBeInTheDocument()
    })

    it('gates the edit button on update.fleet_vehicle alone', () => {
      mockHasPermission.mockImplementation((p: string) => p !== 'update.fleet_vehicle')
      render(<FleetDriversPage />)
      expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '+ Tambah sopir' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hapus' })).toBeInTheDocument()
    })

    it('gates the delete button on delete.fleet_vehicle alone', () => {
      mockHasPermission.mockImplementation((p: string) => p !== 'delete.fleet_vehicle')
      render(<FleetDriversPage />)
      expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '+ Tambah sopir' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
    })

    it('hides every mutating control when no permission is held', () => {
      mockHasPermission.mockReturnValue(false)
      render(<FleetDriversPage />)
      expect(screen.queryByRole('button', { name: /Tambah/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument()
    })
  })

  describe('the table', () => {
    // The table is the whole screen; nothing else tells the operator what a row holds. Cell text is
    // compared exactly so a value cannot hide inside a longer one.
    it('renders each column of a row', () => {
      render(<FleetDriversPage />)

      expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
        'Nama',
        'Telepon',
        'Nomor SIM',
        'Jenis SIM',
        'Berlaku sampai',
        '',
      ])

      const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
      expect(cells[0].textContent).toBe('Budi')
      expect(cells[1].textContent).toBe('0812')
      expect(cells[2].textContent).toBe('SIM-9')
      // The nested label, not the raw id: a row rendering simJenisId would show a UUID.
      expect(cells[3].textContent).toBe('B1 Umum')
      expect(cells[4].textContent).toBe('2027-01-31')
    })

    // Every optional column falls back to an em dash. A driver with no SIM on file is normal, and
    // rendering 'null' or a blank cell reads as a rendering bug rather than missing data.
    it('renders an em dash for each column the driver has no value for', () => {
      mockUseFleetDrivers.mockReturnValue({
        data: [
          {
            id: 'd2',
            nama: 'Siti',
            telepon: null,
            simNomor: null,
            simJenisId: null,
            simJenis: null,
            simExpiresAt: null,
            isActive: true,
          },
        ],
        isLoading: false,
      })
      render(<FleetDriversPage />)

      const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
      expect(cells[0].textContent).toBe('Siti')
      expect(cells[1].textContent).toBe('—')
      expect(cells[2].textContent).toBe('—')
      expect(cells[3].textContent).toBe('—')
      expect(cells[4].textContent).toBe('—')
    })

    // A table that ignores isLoading flashes "no drivers" on every keystroke in the search box,
    // telling the operator the search found nothing while it is still running.
    it('shows the loading row rather than the empty message while fetching', () => {
      mockUseFleetDrivers.mockReturnValue({ data: undefined, isLoading: true })
      render(<FleetDriversPage />)
      expect(screen.getByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText('Belum ada sopir terdaftar.')).not.toBeInTheDocument()
    })

    it('tells the operator the list is empty once the fetch settles with no rows', () => {
      mockUseFleetDrivers.mockReturnValue({ data: [], isLoading: false })
      render(<FleetDriversPage />)
      expect(screen.getByText('Belum ada sopir terdaftar.')).toBeInTheDocument()
    })

    it('titles the page and explains that SIM warnings follow the driver', () => {
      render(<FleetDriversPage />)
      expect(screen.getByRole('heading', { name: 'Sopir' })).toBeInTheDocument()
      expect(
        screen.getByText(
          'Data sopir dan masa berlaku SIM. Peringatan SIM mengikuti sopirnya, bukan kendaraan.',
        ),
      ).toBeInTheDocument()
    })
  })

  describe('delete', () => {
    it('deletes the driver the operator confirmed', async () => {
      render(<FleetDriversPage />)
      const dialog = openDeleteDialog()
      fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('d1'))
    })

    // ConfirmDialog does not catch, so an uncaught rejection would leave the dialog open with no
    // explanation and the driver still listed. The backend message is surfaced verbatim because it
    // is the only thing that says what still references the driver.
    it('surfaces the backend refusal when a delete is rejected', async () => {
      mockDelete.mockRejectedValue({
        response: { data: { message: 'Sopir masih terpasang di 2 kendaraan.' } },
      })
      render(<FleetDriversPage />)
      const dialog = openDeleteDialog()
      fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

      expect(
        await screen.findByText('Sopir masih terpasang di 2 kendaraan.'),
      ).toBeInTheDocument()
    })

    // A transport failure carries no response body. Without the fallback the banner renders empty
    // and the driver appears deleted when they were not.
    it('falls back to a generic message when the failure carries no body', async () => {
      mockDelete.mockRejectedValue(new Error('Network Error'))
      render(<FleetDriversPage />)
      const dialog = openDeleteDialog()
      fireEvent.click(dialog.getByRole('button', { name: 'Hapus' }))

      expect(await screen.findByText('Gagal menghapus sopir.')).toBeInTheDocument()
    })

    // The confirmation has to name the driver: with several rows on screen the dialog is the last
    // chance to notice the wrong Hapus button was clicked.
    it('names the driver in the delete confirmation', () => {
      render(<FleetDriversPage />)
      const dialog = openDeleteDialog()
      expect(dialog.getByText('Hapus sopir')).toBeInTheDocument()
      expect(
        dialog.getByText('Hapus Budi? Tindakan ini tidak bisa dibatalkan.'),
      ).toBeInTheDocument()
    })

    it('shows no error banner before anything has failed', () => {
      render(<FleetDriversPage />)
      expect(screen.queryByText(/Gagal menghapus/)).not.toBeInTheDocument()
    })
  })
})
