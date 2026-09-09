import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MasterDataFormDialog } from './MasterDataFormDialog'
import { FleetMasterRow } from '../types'

describe('MasterDataFormDialog', () => {
  const base = {
    open: true,
    category: 'leasing' as const,
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('derives a slug code from the label when creating', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'BCA Finance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: 'bca_finance' })),
    )
  })

  it('rejects an empty label', async () => {
    const onSubmit = jest.fn()
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Label wajib diisi.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // warnDays only means something for the two categories that carry an expiry date; showing it on
  // a pool would invite an admin to set a threshold that nothing reads.
  it('hides the warning-threshold field for categories without an expiry', () => {
    render(<MasterDataFormDialog {...base} category="pool" />)
    expect(screen.queryByLabelText(/Ambang peringatan/)).not.toBeInTheDocument()
  })

  it('shows the warning-threshold field for jenis_dokumen', () => {
    render(<MasterDataFormDialog {...base} category="jenis_dokumen" />)
    expect(screen.getByLabelText(/Ambang peringatan/)).toBeInTheDocument()
  })

  // code is the row's identity: the backend refuses to change it, so the form must not offer to.
  it('locks the code field when editing', () => {
    render(
      <MasterDataFormDialog
        {...base}
        initial={{
          id: 'r1',
          category: 'leasing',
          code: 'mtf',
          label: 'MTF',
          sortOrder: 10,
          isActive: true,
          warnDays: null,
          defaultValidMonths: null,
          isRequired: null,
        }}
      />,
    )
    expect(screen.getByLabelText(/Kode/)).toBeDisabled()
  })

  it('surfaces the backend conflict message', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Code "mtf" already exists under category "leasing"' } },
    })
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
  })

  // Added beyond the brief. Every edit-mode seed (label, sortOrder, warnDays) plus the preserved
  // code has to survive a save the operator never touched: the backend treats the PATCH body as
  // the new truth, so a seed replaced by a hardcoded '' / 0 / null would silently wipe the
  // operator's existing row. Asserted against a bare object rather than objectContaining, because
  // objectContaining cannot see a field that vanished.
  it('carries every seeded value back when editing without touching the form', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const initial: FleetMasterRow = {
      id: 'r9',
      category: 'jenis_dokumen',
      code: 'kir',
      label: 'KIR Tahunan',
      sortOrder: 20,
      isActive: true,
      warnDays: 45,
      defaultValidMonths: 12,
      isRequired: true,
    }
    render(
      <MasterDataFormDialog
        {...base}
        category="jenis_dokumen"
        initial={initial}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'jenis_dokumen',
        code: 'kir',
        label: 'KIR Tahunan',
        sortOrder: 20,
        warnDays: 45,
      }),
    )
  })

  // Added beyond the brief. 'BCA Finance' alone leaves the underscore trim and the label trim
  // unexercised: a slug of '_pt_astra_' would be rejected by the backend's /^[a-z0-9_]+$/... rule
  // only after the operator lost the form. The bare object also pins the create-path defaults.
  it('trims the label and strips edge punctuation from the derived code', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: '  PT. Astra!  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'leasing',
        code: 'pt_astra',
        label: 'PT. Astra!',
        sortOrder: 0,
        warnDays: null,
      }),
    )
  })

  // Added beyond the brief. An empty threshold has to travel as null, not 0: the backend reads 0
  // as "warn on the due date itself", which is a different rule from "use the 30-day default".
  it('sends a null threshold when the operator leaves it empty', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <MasterDataFormDialog {...base} category="jenis_dokumen" onSubmit={onSubmit} />,
    )
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Pajak' } })
    fireEvent.change(screen.getByLabelText(/Urutan tampil/), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'jenis_dokumen',
        code: 'pajak',
        label: 'Pajak',
        sortOrder: 7,
        warnDays: null,
      }),
    )
  })

  // Added beyond the brief. 0 is a real threshold — "warn on the expiry date itself" — and a
  // different rule from an empty field, which means "fall back to the backend's 30 days". A falsy
  // check anywhere on this path silently rewrites the operator's 0 into null, the backend applies
  // 30 days, warnings fire a month early and nothing in the UI explains why.
  it('sends a typed zero threshold as 0, not as an empty default', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} category="jenis_dokumen" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Pajak' } })
    fireEvent.change(screen.getByLabelText(/Ambang peringatan/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'jenis_dokumen',
        code: 'pajak',
        label: 'Pajak',
        sortOrder: 0,
        warnDays: 0,
      }),
    )
  })

  // The same 0 has to survive the round trip in edit mode: seeded into the field as '0' rather
  // than blanked, and sent straight back when the operator saves without touching it.
  it('seeds an existing zero threshold into the field and carries it back unchanged', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const initial: FleetMasterRow = {
      id: 'r7',
      category: 'jenis_dokumen',
      code: 'kir',
      label: 'KIR Tahunan',
      sortOrder: 20,
      isActive: true,
      warnDays: 0,
      defaultValidMonths: 12,
      isRequired: true,
    }
    render(
      <MasterDataFormDialog
        {...base}
        category="jenis_dokumen"
        initial={initial}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText(/Ambang peringatan/)).toHaveValue(0)

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'jenis_dokumen',
        code: 'kir',
        label: 'KIR Tahunan',
        sortOrder: 20,
        warnDays: 0,
      }),
    )
  })

  // Added beyond the brief. An edit dialog that titles itself "Tambah Leasing" tells the operator
  // they are creating a second row when they are about to overwrite an existing one, and the code
  // hint has to say the field is frozen rather than promise it will be generated.
  it('labels itself as an edit and explains the code is frozen when seeded', () => {
    render(
      <MasterDataFormDialog
        {...base}
        initial={{
          id: 'r1',
          category: 'leasing',
          code: 'mtf',
          label: 'MTF',
          sortOrder: 10,
          isActive: true,
          warnDays: null,
          defaultValidMonths: null,
          isRequired: null,
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Ubah Leasing' })).toBeInTheDocument()
    expect(screen.getByText('Kode tidak bisa diubah.')).toBeInTheDocument()
    expect(screen.queryByText('Dibuat otomatis dari label.')).not.toBeInTheDocument()
  })

  it('labels itself as an add and promises a generated code when creating', () => {
    render(<MasterDataFormDialog {...base} />)
    expect(screen.getByRole('heading', { name: 'Tambah Leasing' })).toBeInTheDocument()
    expect(screen.getByText('Dibuat otomatis dari label.')).toBeInTheDocument()
    expect(screen.queryByText('Kode tidak bisa diubah.')).not.toBeInTheDocument()
  })

  // Added beyond the brief. submitting exists purely to stop a double-submit; if the buttons stay
  // live during an in-flight save the operator gets two rows from one impatient double-click.
  it('disables both footer buttons while a submit is in flight', async () => {
    let release: () => void = () => {}
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })

    const save = screen.getByRole('button', { name: 'Simpan' })
    const cancel = screen.getByRole('button', { name: 'Batal' })
    expect(save).toBeEnabled()
    expect(cancel).toBeEnabled()

    fireEvent.click(save)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Menyimpan\u2026' })).toBeDisabled(),
    )
    expect(cancel).toBeDisabled()

    await act(async () => {
      release()
    })
  })

  // Added beyond the brief. Batal is the only way out that does not save; wired to nothing, the
  // dialog traps the operator with no way to abandon a half-typed row.
  it('closes without submitting when Batal is pressed', () => {
    const onClose = jest.fn()
    const onSubmit = jest.fn()
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Added beyond the brief. Radix drives Escape and the overlay through onOpenChange; if the
  // handler drops the close the dialog stays on screen after the operator dismisses it, and the
  // parent still believes it is closed.
  it('closes when the dialog is dismissed rather than submitted', () => {
    const onClose = jest.fn()
    const onSubmit = jest.fn()
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Added beyond the brief. A cleared "Urutan tampil" must fall back to 0, not to NaN — NaN
  // serialises to null in JSON and the backend rejects the row. jsdom sanitises non-numeric text
  // in a number input to '', so '-0' is the reachable input that tells `|| 0` apart from `?? 0`:
  // `?? 0` would keep -0 and pass it on.
  it('normalises a negative-zero sort order to plain 0', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.change(screen.getByLabelText(/Urutan tampil/), { target: { value: '-0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'leasing',
        code: 'mtf',
        label: 'MTF',
        sortOrder: 0,
        warnDays: null,
      }),
    )
    expect(Object.is(onSubmit.mock.calls[0][0].sortOrder, 0)).toBe(true)
  })

  it('sends 0 for a sort order the operator cleared entirely', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.change(screen.getByLabelText(/Urutan tampil/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category: 'leasing',
        code: 'mtf',
        label: 'MTF',
        sortOrder: 0,
        warnDays: null,
      }),
    )
  })

  // Added beyond the brief. The bounds are the only thing stopping a threshold of 999 days, which
  // the backend rejects; 365 is the documented ceiling.
  it('bounds the threshold field to a year', () => {
    render(<MasterDataFormDialog {...base} category="jenis_dokumen" />)
    const warn = screen.getByLabelText(/Ambang peringatan/)
    expect(warn).toHaveAttribute('min', '0')
    expect(warn).toHaveAttribute('max', '365')
  })

  // Added beyond the brief. A label of pure punctuation passes the "not blank" check but slugifies
  // to '', which the backend rejects with a validation error the operator cannot act on.
  it('rejects a label that slugifies to nothing', async () => {
    const onSubmit = jest.fn()
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: '???' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Label harus memuat huruf atau angka.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Added beyond the brief. A transport failure carries no response body, so without the fallback
  // the banner renders empty and the operator sees a form that did nothing with no explanation.
  it('falls back to a generic message when the failure carries no body', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Network Error'))
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Terjadi kesalahan. Coba lagi.')).toBeInTheDocument()
  })

  // Added beyond the brief. The success path has to close the dialog and the failure path has to
  // keep it open, or the operator either re-submits the same row or loses what they typed.
  it('closes on a successful submit but stays open when the backend rejects', async () => {
    const onClose = jest.fn()
    const { unmount } = render(
      <MasterDataFormDialog
        {...base}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    unmount()

    const onCloseRejected = jest.fn()
    render(
      <MasterDataFormDialog
        {...base}
        onSubmit={jest.fn().mockRejectedValue({ response: { data: { message: 'Ditolak.' } } })}
        onClose={onCloseRejected}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Ditolak.')).toBeInTheDocument()
    expect(onCloseRejected).not.toHaveBeenCalled()
  })
})
