import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
