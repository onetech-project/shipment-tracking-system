import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleFormDialog } from './VehicleFormDialog'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../types'

const master = (id: string, label: string): FleetMasterRow => ({
  id,
  category: 'pool',
  code: id,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
})

const driver: FleetDriver = {
  id: 'dr1',
  nama: 'Ahmad Fauzi',
  telepon: null,
  simNomor: null,
  simJenisId: null,
  simExpiresAt: null,
  isActive: true,
}

const existing = {
  id: 'v1',
  nopol: 'B 9114 KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: '8 ton',
  noRangka: 'MHM111',
  noMesin: '4D34-1',
  noBpkb: 'M-01',
  pemilikUnit: 'PT Sumber Jaya',
  odometer: 120000,
  catatan: 'Servis rutin',
  jenisArmada: { id: 'ja1', label: 'CDE' },
  kepemilikan: { id: 'kp1', label: 'Milik Sendiri' },
  pool: { id: 'p1', label: 'Pool Cakung' },
  status: { id: 's1', label: 'Beroperasi' },
  driver: null,
  documents: [],
  worstSeverity: 'none',
  minDaysLeft: null,
  isActive: true,
} as FleetVehicle

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleFormDialog
      open
      masterData={{
        jenisArmada: [master('ja1', 'CDE')],
        kepemilikan: [master('kp1', 'Milik Sendiri')],
        pool: [master('p1', 'Pool Cakung')],
        status: [master('s1', 'Beroperasi')],
      }}
      drivers={[driver]}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

const typePlate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/nomor polisi/i), { target: { value } })

describe('VehicleFormDialog', () => {
  it('opens empty when adding a vehicle', () => {
    setup()
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('')
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  // Every field, with a distinct fixture value each: a prefill wired to the wrong state hook
  // ships green under partial assertions and silently edits the neighbouring column.
  it('prefills every field when editing', () => {
    setup({ initial: existing })
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('B 9114 KYZ')
    expect(screen.getByLabelText(/merk/i)).toHaveValue('Mitsubishi')
    expect(screen.getByLabelText(/tipe/i)).toHaveValue('Canter')
    expect(screen.getByLabelText(/tahun/i)).toHaveValue(2021)
    expect(screen.getByLabelText(/kapasitas/i)).toHaveValue('8 ton')
    expect(screen.getByLabelText(/odometer/i)).toHaveValue(120000)
    expect(screen.getByLabelText(/nomor rangka/i)).toHaveValue('MHM111')
    expect(screen.getByLabelText(/nomor mesin/i)).toHaveValue('4D34-1')
    expect(screen.getByLabelText(/nomor bpkb/i)).toHaveValue('M-01')
    expect(screen.getByLabelText(/pemilik unit/i)).toHaveValue('PT Sumber Jaya')
    expect(screen.getByLabelText(/catatan/i)).toHaveValue('Servis rutin')
  })

  // The master refs arrive as {id,label} objects but the selects need the id — a mismatch here
  // silently resets the dropdown to blank on every edit and quietly clears the column on save.
  it('preselects the master dropdowns from the nested refs', () => {
    setup({ initial: existing })
    expect(screen.getByLabelText(/jenis armada/i)).toHaveValue('ja1')
    expect(screen.getByLabelText(/kepemilikan/i)).toHaveValue('kp1')
    expect(screen.getByLabelText(/pool/i)).toHaveValue('p1')
    expect(screen.getByLabelText(/status/i)).toHaveValue('s1')
  })

  it('refuses to submit without a plate', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a plate that is only whitespace', async () => {
    const { onSubmit } = setup()
    typePlate('   ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Typed with stray spaces on purpose: an untrimmed plate is a different string to the unique
  // index, so ' B 9114 KYZ ' would slip past the duplicate check and register the truck twice.
  it('submits the plate the operator typed, trimmed', async () => {
    const { onSubmit } = setup()
    typePlate('  B 9114 KYZ  ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B 9114 KYZ' })),
    )
  })

  // Optional text travels as null, never ''. The backend reads an absent value as "leave
  // unchanged", so an empty string would make a cleared field unclearable.
  it('sends null rather than an empty string for untouched optional text', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({
      nopol: 'B 1 A',
      merk: null,
      tipe: null,
      tahun: null,
      kapasitas: null,
      noRangka: null,
      noMesin: null,
      noBpkb: null,
      pemilikUnit: null,
      odometer: null,
      catatan: null,
      jenisArmadaId: null,
      kepemilikanId: null,
      poolId: null,
      statusId: null,
      driverId: null,
    })
  })

  // A blank number input yields '' — Number('') is 0, which would silently register a 1970
  // model year and a zero odometer on a used truck.
  it('sends null rather than zero for a blank year and odometer', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].tahun).toBeNull()
    expect(onSubmit.mock.calls[0][0].odometer).toBeNull()
  })

  it('sends the year and odometer as numbers, not strings', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.change(screen.getByLabelText(/tahun/i), { target: { value: '2021' } })
    fireEvent.change(screen.getByLabelText(/odometer/i), { target: { value: '120000' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].tahun).toBe(2021)
    expect(onSubmit.mock.calls[0][0].odometer).toBe(120000)
  })

  // One distinct value per field, asserted as a whole payload. Identical placeholders would let a
  // field cross-wired to its neighbour's setter — the defect a 15-field form actually produces —
  // pass while writing the wrong column.
  it('sends every field the operator typed, each to its own key', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/nomor polisi/i), { target: { value: 'B 1 A' } })
    fireEvent.change(screen.getByLabelText(/merk/i), { target: { value: '  Hino  ' } })
    fireEvent.change(screen.getByLabelText(/tipe/i), { target: { value: '  Dutro  ' } })
    fireEvent.change(screen.getByLabelText(/tahun/i), { target: { value: '2019' } })
    fireEvent.change(screen.getByLabelText(/kapasitas/i), { target: { value: '  5 ton  ' } })
    fireEvent.change(screen.getByLabelText(/odometer/i), { target: { value: '84000' } })
    fireEvent.change(screen.getByLabelText(/nomor rangka/i), { target: { value: '  RANGKA-7  ' } })
    fireEvent.change(screen.getByLabelText(/nomor mesin/i), { target: { value: '  MESIN-8  ' } })
    fireEvent.change(screen.getByLabelText(/nomor bpkb/i), { target: { value: '  BPKB-9  ' } })
    fireEvent.change(screen.getByLabelText(/pemilik unit/i), { target: { value: '  CV Andalan  ' } })
    fireEvent.change(screen.getByLabelText(/catatan/i), { target: { value: '  Ban baru  ' } })
    fireEvent.change(screen.getByLabelText(/jenis armada/i), { target: { value: 'ja1' } })
    fireEvent.change(screen.getByLabelText(/kepemilikan/i), { target: { value: 'kp1' } })
    fireEvent.change(screen.getByLabelText(/pool/i), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 's1' } })
    fireEvent.change(screen.getByLabelText(/sopir/i), { target: { value: 'dr1' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({
      nopol: 'B 1 A',
      merk: 'Hino',
      tipe: 'Dutro',
      tahun: 2019,
      kapasitas: '5 ton',
      noRangka: 'RANGKA-7',
      noMesin: 'MESIN-8',
      noBpkb: 'BPKB-9',
      pemilikUnit: 'CV Andalan',
      odometer: 84000,
      catatan: 'Ban baru',
      jenisArmadaId: 'ja1',
      kepemilikanId: 'kp1',
      poolId: 'p1',
      statusId: 's1',
      driverId: 'dr1',
    })
  })

  it('sends the chosen driver', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.change(screen.getByLabelText(/sopir/i), { target: { value: 'dr1' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].driverId).toBe('dr1')
  })

  it('lists the master options it was given', () => {
    setup()
    expect(screen.getByRole('option', { name: 'Pool Cakung' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ahmad Fauzi' })).toBeInTheDocument()
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The 409 from a duplicate plate is the single most likely error here, and the backend's
  // message names the plate. Swallowing it for a generic string loses that.
  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Plate "B 9114 KYZ" is already registered' } },
    })
    setup({ onSubmit })
    typePlate('B 9114 KYZ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('stays open when the save fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'))
    const { onClose } = setup({ onSubmit })
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await screen.findByText(/terjadi kesalahan/i)
    expect(onClose).not.toHaveBeenCalled()
  })

  // Without this a double-click sends two POSTs and registers the vehicle twice — or fails the
  // second with a 409 that looks like the first one failed.
  it('disables the submit button while saving', async () => {
    let resolve: () => void = () => {}
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)))
    setup({ onSubmit })
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  // Added beyond the brief: without preventDefault the browser navigates away on submit and the
  // operator loses the form. Nothing else in the suite notices, because jsdom does not navigate.
  it('prevents the browser default form submit', () => {
    setup()
    typePlate('B 1 A')
    const form = document.querySelector('form') as HTMLFormElement
    const submitEvent = createEvent.submit(form)
    fireEvent(form, submitEvent)
    expect(submitEvent.defaultPrevented).toBe(true)
  })

  it('closes without saving when cancelled', () => {
    const { onSubmit, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /batal/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Escape is the only keyboard way out of this dialog; a regression in onOpenChange strands the
  // operator in it with no exit.
  it('closes without saving when dismissed with Escape', async () => {
    const { onSubmit, onClose } = setup()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
