import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { BerkasUploadDialog } from './BerkasUploadDialog'

const VEHICLE = { id: 'v1', nopol: 'B 9114 KYZ' }
const SLOT = { id: 's1', code: 'stnk', label: 'STNK' }

function pdf(name = 'stnk.pdf', size = 1024) {
  const file = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('BerkasUploadDialog', () => {
  it('names the vehicle and the slot being filled', () => {
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText(/STNK/)).toBeInTheDocument()
    expect(screen.getByText(/B 9114 KYZ/)).toBeInTheDocument()
  })

  it('hands the chosen file to the uploader', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined)
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const file = pdf()
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), file)
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
  })

  // Refused in the browser so a doomed 10 MB upload is not started; the backend refuses it too.
  it('refuses a file over 10 MB without calling the uploader', async () => {
    const onUpload = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf('big.pdf', 11 * 1024 * 1024))
    expect(await screen.findByText(/maksimal 10 MB/i)).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('refuses a type outside the allow-list', async () => {
    const onUpload = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const exe = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' })
    // userEvent.upload silently drops a file that fails the input's own `accept` filter by
    // default, which would let this test pass without ever reaching the component's MIME check.
    // Disable that filtering so the assertion below exercises app-level validation, not the
    // browser's file-picker simulation.
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText(/pilih berkas/i), exe)
    expect(await screen.findByText(/jpg, png, webp, atau pdf/i)).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  // Spec §6.4: the prototype showed its success toast before the promise settled, then swallowed
  // the failure. Here the dialog stays open until the server has actually answered.
  it('closes only after the upload resolves', async () => {
    let resolve: () => void = () => {}
    const onUpload = jest.fn(() => new Promise<void>((r) => { resolve = r }))
    const onClose = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={onClose}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf())
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    expect(onClose).not.toHaveBeenCalled()
    // Guards against a double submit while the request is in flight — the same in-flight window
    // this test already holds open by not resolving `onUpload` yet.
    expect(screen.getByRole('button', { name: /unggah/i })).toBeDisabled()
    resolve()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The 11 MB case above is far from the 10 MB ceiling; this pins the boundary itself so a check
  // that flips from "over the limit" to "at or over the limit" is not missed.
  it('accepts a file exactly at the 10 MB limit', async () => {
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf('exact.pdf', 10 * 1024 * 1024))
    expect(screen.queryByText(/maksimal 10 MB/i)).not.toBeInTheDocument()
  })

  it('reports a failed upload and stays open', async () => {
    const onUpload = jest.fn().mockRejectedValue(new Error('Gagal mengunggah berkas (403)'))
    const onClose = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={onClose}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf())
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    expect(await screen.findByText(/gagal mengunggah/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stores an external link instead of a file', async () => {
    const onSetUrl = jest.fn().mockResolvedValue(undefined)
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={onSetUrl}
        onClose={jest.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(/tautan/i), 'https://arsip.example/stnk.pdf')
    await userEvent.click(screen.getByRole('button', { name: /simpan tautan/i }))

    await waitFor(() => expect(onSetUrl).toHaveBeenCalledWith('https://arsip.example/stnk.pdf'))
  })

  // The backend and the DTO both refuse this; refusing it here as well means the operator is told
  // why rather than shown a 400.
  it('refuses a link that is not http or https', async () => {
    const onSetUrl = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={onSetUrl}
        onClose={jest.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(/tautan/i), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: /simpan tautan/i }))

    expect(await screen.findByText(/harus diawali http/i)).toBeInTheDocument()
    expect(onSetUrl).not.toHaveBeenCalled()
  })
})
