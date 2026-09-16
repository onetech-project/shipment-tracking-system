import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
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
          simFile: null,
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
          simFile: null,
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

describe('softcopy SIM', () => {
  const savedDriver = {
    id: 'd1',
    nama: 'Budi',
    telepon: null,
    simNomor: null,
    simJenisId: null,
    simJenis: null,
    simExpiresAt: null,
    simFile: null,
    isActive: true,
  }

  const withScan = {
    ...savedDriver,
    simFile: { originalName: 'sim.png', mimeType: 'image/png', sizeBytes: 524288 },
  }

  it('says the driver has no scan yet', () => {
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={savedDriver}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText(/belum ada softcopy/i)).toBeInTheDocument()
  })

  it('reports the filename and size of an existing scan', () => {
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={withScan}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText(/sim\.png/)).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
  })

  // A new driver has no id yet, so there is nowhere to attach a file to. Checked against both the
  // upload affordance and the section heading, so a mutation that renders the slot on some
  // unrelated condition (e.g. always true) cannot slip past on the strength of one dropped query.
  it('offers no upload until the driver has been saved', () => {
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={jest.fn()} onClose={jest.fn()} />,
    )
    expect(screen.queryByText('Softcopy SIM')).not.toBeInTheDocument()
    expect(screen.queryByText(/unggah sim/i)).not.toBeInTheDocument()
  })

  it('refuses a file over 10 MB', async () => {
    const onUploadSim = jest.fn()
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={savedDriver}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        onUploadSim={onUploadSim}
      />,
    )
    const file = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
    await userEvent.upload(screen.getByLabelText(/unggah sim/i), file)

    // Anchored: BerkasUploadDialog's equivalent test already found that an unanchored match can
    // bind to a static hint sharing the same "10 MB" substring. This slot has no such hint today,
    // but anchoring costs nothing and keeps the assertion meaningful if one is ever added.
    expect(await screen.findByText(/^Ukuran berkas maksimal 10 MB\.$/)).toBeInTheDocument()
    expect(onUploadSim).not.toHaveBeenCalled()
  })

  // Beyond the brief's sketch: without this, the 10 MB test above could pass even if the upload
  // path were wired to the wrong driver id or never called the file through at all.
  it('hands a valid file to the upload callback with the driver id', async () => {
    const onUploadSim = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={savedDriver}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        onUploadSim={onUploadSim}
      />,
    )
    const file = new File(['x'], 'sim.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(/unggah sim/i), file)

    await waitFor(() => expect(onUploadSim).toHaveBeenCalledWith('d1', file))
  })

  // Beyond the brief's sketch: "Lihat" and "Hapus" are the other two callbacks Step 4 wires up,
  // and neither was in the comment sketch. Left untested, a click that silently did nothing would
  // still pass every other test in this file.
  it('opens the scan through the view callback', async () => {
    const onViewSim = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={withScan}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        onViewSim={onViewSim}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Lihat' }))
    expect(onViewSim).toHaveBeenCalledWith('d1')
  })

  it('deletes the scan through the delete callback', async () => {
    const onDeleteSim = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={withScan}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        onDeleteSim={onDeleteSim}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    expect(onDeleteSim).toHaveBeenCalledWith('d1')
  })

  // Without a scan there is nothing to view or remove — offering these buttons anyway would let an
  // operator click through to a download URL or delete request for a file that does not exist.
  it('offers no Lihat or Hapus button when there is no scan yet', () => {
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={savedDriver}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Lihat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument()
  })
})
