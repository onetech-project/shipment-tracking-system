import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { FilePreviewDialog, FilePreviewState } from './FilePreviewDialog'

const ready = (overrides: Partial<Extract<FilePreviewState, { status: 'ready' }>> = {}) => ({
  status: 'ready' as const,
  url: 'https://files.example.com/presigned?sig=1',
  mimeType: 'image/png',
  filename: 'stnk.png',
  ...overrides,
})

const renderDialog = (state: FilePreviewState, props: Record<string, unknown> = {}) =>
  render(
    <FilePreviewDialog
      open
      title="Softcopy STNK"
      subtitle="B 9114 KYZ"
      state={state}
      onDownload={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />,
  )

describe('FilePreviewDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog(ready(), { open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the slot and the unit it belongs to', () => {
    renderDialog(ready())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Softcopy STNK')).toBeInTheDocument()
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
  })

  it('shows an image as an image', () => {
    renderDialog(ready({ mimeType: 'image/png' }))
    const img = screen.getByRole('img', { name: 'stnk.png' })
    expect(img).toHaveAttribute('src', 'https://files.example.com/presigned?sig=1')
  })

  // A PDF goes to the browser's own viewer rather than an <img> that would render nothing.
  it('shows a pdf in a frame', () => {
    renderDialog(ready({ mimeType: 'application/pdf', filename: 'stnk.pdf' }))
    const frame = screen.getByTitle('stnk.pdf')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', 'https://files.example.com/presigned?sig=1')
  })

  // mimeType comes from a row that may predate the current allow-list. Guessing <img> for an
  // unknown type shows an empty box with no explanation; saying so leaves the download as a way out.
  it('offers a download instead of a blank box for a type it cannot show', () => {
    renderDialog(ready({ mimeType: 'application/msword', filename: 'stnk.doc' }))
    expect(screen.getByText(/pratinjau tidak tersedia/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unduh' })).toBeEnabled()
  })

  it('treats a missing mime type the same way', () => {
    renderDialog(ready({ mimeType: null, filename: null }))
    expect(screen.getByText(/pratinjau tidak tersedia/i)).toBeInTheDocument()
  })

  it('says it is still fetching', () => {
    renderDialog({ status: 'loading' })
    expect(screen.getByRole('status', { name: /memuat berkas/i })).toBeInTheDocument()
  })

  // The download button would fetch a second URL for a file we could not fetch a first one for.
  it('shows the failure and does not offer a download while it stands', () => {
    renderDialog({ status: 'error', message: 'Berkas tidak ditemukan.' })
    expect(screen.getByText('Berkas tidak ditemukan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unduh' })).not.toBeInTheDocument()
  })

  it('asks its caller to download', async () => {
    const onDownload = jest.fn()
    renderDialog(ready(), { onDownload })
    await userEvent.click(screen.getByRole('button', { name: 'Unduh' }))
    expect(onDownload).toHaveBeenCalledTimes(1)
  })

  it('asks its caller to close', async () => {
    const onClose = jest.fn()
    renderDialog(ready(), { onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
