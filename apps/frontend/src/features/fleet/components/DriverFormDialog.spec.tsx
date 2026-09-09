import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DriverFormDialog } from './DriverFormDialog'
import { FleetMasterRow } from '../types'

const simTypes = [
  { id: 'sim-1', label: 'B1 Umum', category: 'jenis_sim' },
  { id: 'sim-2', label: 'B2 Umum', category: 'jenis_sim' },
] as FleetMasterRow[]

describe('DriverFormDialog', () => {
  it('refuses to submit without a name', async () => {
    const onSubmit = jest.fn()
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Nama sopir wajib diisi.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed name with the chosen licence class', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), {
      target: { value: '  Budi Santoso  ' },
    })
    fireEvent.change(screen.getByLabelText(/Jenis SIM/), { target: { value: 'sim-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ nama: 'Budi Santoso', simJenisId: 'sim-2' }),
      ),
    )
  })

  // The backend reads an omitted field as "leave unchanged", so a cleared optional field has to
  // travel as null or it becomes unremovable.
  it('sends null rather than an empty string for cleared optional fields', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={{
          id: 'd1',
          nama: 'Budi',
          telepon: '0812',
          simNomor: 'X',
          simJenisId: 'sim-1',
          simJenis: null,
          simExpiresAt: '2027-01-01',
          isActive: true,
        }}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Nomor telepon/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ telepon: null })),
    )
  })

  it('surfaces the backend error message', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue({ response: { data: { message: 'simJenisId must reference a jenis_sim master row' } } })
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Budi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/must reference a jenis_sim/)).toBeInTheDocument()
  })

  // Added beyond the brief: without these, `simNomor`/`simExpiresAt` could be hardcoded to null
  // and every brief test still passed.
  it('submits the licence number and expiry the operator typed', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Budi' } })
    fireEvent.change(screen.getByLabelText(/Nomor SIM/), { target: { value: ' B1234XY ' } })
    fireEvent.change(screen.getByLabelText(/Masa berlaku SIM/), {
      target: { value: '2027-05-31' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ simNomor: 'B1234XY', simExpiresAt: '2027-05-31' }),
      ),
    )
  })

  // Added beyond the brief: the success path has to close the dialog, or the operator sees the
  // form still open and submits the same driver twice.
  it('closes on a successful submit but stays open when the backend rejects', async () => {
    const onClose = jest.fn()
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const { unmount } = render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={onClose} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Budi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    unmount()

    const onCloseRejected = jest.fn()
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        onSubmit={jest.fn().mockRejectedValue({ response: { data: { message: 'Ditolak.' } } })}
        onClose={onCloseRejected}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Budi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Ditolak.')).toBeInTheDocument()
    expect(onCloseRejected).not.toHaveBeenCalled()
  })

  // An optional field the operator never touched has to survive an edit: the backend reads an
  // explicit null as "clear this column", so a dropped seed would silently wipe the driver's
  // licence number, class and expiry. Asserted against a bare object, not objectContaining, so a
  // field that arrives as null instead of its seeded value is caught rather than ignored.
  it('keeps optional fields the operator did not touch when editing', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={{
          id: 'd1',
          nama: 'Budi',
          telepon: '0812',
          simNomor: 'X9',
          simJenisId: 'sim-1',
          simJenis: null,
          simExpiresAt: '2027-01-01',
          isActive: true,
        }}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText('Ubah sopir')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        nama: 'Budi',
        telepon: '0812',
        simNomor: 'X9',
        simJenisId: 'sim-1',
        simExpiresAt: '2027-01-01',
      }),
    )
  })
})
