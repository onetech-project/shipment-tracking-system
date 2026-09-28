import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BerkasSlotCard } from './BerkasSlotCard'

const SLOT = { id: 's1', code: 'stnk', label: 'STNK' }

const FILE = {
  id: 'f1',
  slotId: 's1',
  slotCode: 'stnk',
  slotLabel: 'STNK',
  originalName: 'stnk.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 524288,
  externalUrl: null,
  uploadedAt: '2026-09-01T00:00:00Z',
}

const noop = () => {}

describe('BerkasSlotCard', () => {
  it('names the slot and says when it is empty', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText('STNK')).toBeInTheDocument()
    expect(screen.getByText(/belum ada berkas/i)).toBeInTheDocument()
  })

  it('reports the filename and its size when a file is there', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/stnk\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
  })

  it('calls the slot an external link when that is what it holds', () => {
    const link = { ...FILE, storageKeyless: true, originalName: null, sizeBytes: null, externalUrl: 'https://arsip.example/a.pdf' }
    render(
      <BerkasSlotCard slot={SLOT} file={link} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/tautan eksternal/i)).toBeInTheDocument()
  })

  it('offers Unggah on an empty slot and Ganti on a filled one', () => {
    const { rerender } = render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /unggah/i })).toBeInTheDocument()

    rerender(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /ganti/i })).toBeInTheDocument()
  })

  it('offers Lihat and Hapus only when a file is there', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.queryByRole('button', { name: /lihat/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument()
  })

  it('reports the view and delete the operator asked for', async () => {
    const onView = jest.fn()
    const onDelete = jest.fn()
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={onView} onDelete={onDelete} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /lihat/i }))
    expect(onView).toHaveBeenCalledWith(FILE)

    await userEvent.click(screen.getByRole('button', { name: /hapus/i }))
    expect(onDelete).toHaveBeenCalledWith(FILE)
  })

  // A read-only operator sees what is on file and can open it; they must not be shown controls
  // that would 403.
  it('hides the editing buttons without permission', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit={false} onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /lihat/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ganti/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument()
  })
})
