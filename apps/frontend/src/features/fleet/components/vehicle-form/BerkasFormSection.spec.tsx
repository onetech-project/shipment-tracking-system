import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BerkasFormSection } from './BerkasFormSection'
import { SlotState, VehicleBerkasApi } from './useVehicleBerkas'
import { FleetMasterRow, FleetVehicleFile } from '../../types'

const slot = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 's1',
  category: 'jenis_berkas',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 10,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: true,
  ...over,
})

const DOC = slot({})
const PHOTO = slot({ id: 's-foto', code: 'foto_depan', label: 'Foto Depan', isRequired: false })

const fileOf = (name: string, type: string, size: number): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const EXISTING: FleetVehicleFile = {
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

const api = (
  states: Record<string, SlotState>,
  over: Partial<VehicleBerkasApi> = {},
): VehicleBerkasApi => ({
  slotState: (id: string) => states[id] ?? { status: 'idle' },
  pick: jest.fn(() => null),
  clear: jest.fn(),
  pendingCount: 0,
  uploadAll: jest.fn(async () => []),
  ...over,
})

const renderSection = (berkas: VehicleBerkasApi, over: Record<string, unknown> = {}) =>
  render(
    <BerkasFormSection
      title="Softcopy Berkas"
      slots={[DOC]}
      existing={[]}
      berkas={berkas}
      cols={3}
      accept="image/jpeg,image/png,image/webp,application/pdf"
      hint="jpg, png, webp, atau pdf · maksimal 10 MB"
      showThumbnail={false}
      {...over}
    />,
  )

describe('BerkasFormSection', () => {
  it('renders nothing when there are no slots of its kind', () => {
    const { container } = renderSection(api({}), { slots: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('says a slot is empty and offers to pick a file', () => {
    renderSection(api({}))
    expect(screen.getByText('STNK')).toBeInTheDocument()
    expect(screen.getByText(/belum ada berkas/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeInTheDocument()
  })

  it('reports what is already on the server', () => {
    renderSection(api({}), { existing: [EXISTING] })
    expect(screen.getByText(/stnk\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
  })

  it('calls a slot an external link when that is what it holds', () => {
    const link = {
      ...EXISTING,
      originalName: null,
      sizeBytes: null,
      externalUrl: 'https://arsip.example/a.pdf',
    }
    renderSection(api({}), { existing: [link] })
    expect(screen.getByText(/tautan eksternal/i)).toBeInTheDocument()
  })

  it('marks a picked file as not yet uploaded and offers to cancel it', () => {
    const state: SlotState = {
      status: 'picked',
      file: fileOf('baru.pdf', 'application/pdf', 1024),
      previewUrl: null,
    }
    renderSection(api({ s1: state }))
    expect(screen.getByText(/baru\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/belum diunggah/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /batalkan pilihan/i })).toBeInTheDocument()
  })

  it('says it is uploading and disables the picker while it does', () => {
    renderSection(api({ s1: { status: 'uploading' } }))
    expect(screen.getByText(/mengunggah/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeDisabled()
  })

  it('shows the failure and offers a retry', () => {
    const state: SlotState = {
      status: 'failed',
      file: fileOf('baru.pdf', 'application/pdf', 1024),
      previewUrl: null,
      message: 'koneksi terputus',
    }
    renderSection(api({ s1: state }))
    expect(screen.getByText(/koneksi terputus/i)).toBeInTheDocument()
    expect(screen.getByText(/coba lagi/i)).toBeInTheDocument()
  })

  // The file is a pdf, which the accept attribute admits: userEvent honours accept, so a
  // text/plain fixture would never reach the handler and the assertion would pass on a
  // component that does nothing. The refusal under test is the hook's, which sees size too.
  it('hands a chosen file to pick and shows the reason when it is refused', async () => {
    const pick = jest.fn(() => 'Ukuran berkas terlalu besar.')
    renderSection(api({}, { pick }))

    const input = screen.getByLabelText(/pilih berkas stnk/i)
    await userEvent.upload(input, fileOf('besar.pdf', 'application/pdf', 11 * 1024 * 1024))

    expect(pick).toHaveBeenCalledWith(DOC, expect.any(File))
    // Not the size wording: the hint line under every card already carries "maksimal 10 MB".
    expect(screen.getByText(/terlalu besar/i)).toBeInTheDocument()
  })

  it('clears the slot when the operator cancels the pick', async () => {
    const clear = jest.fn()
    const state: SlotState = {
      status: 'picked',
      file: fileOf('baru.pdf', 'application/pdf', 1024),
      previewUrl: null,
    }
    renderSection(api({ s1: state }, { clear }))

    await userEvent.click(screen.getByRole('button', { name: /batalkan pilihan/i }))
    expect(clear).toHaveBeenCalledWith('s1')
  })

  // The bytes came off the operator's own disk a moment ago, which is a different thing from
  // rendering content a row carries — see the note on BerkasSlotCard.
  it('renders a thumbnail for a freshly picked photo when asked to', () => {
    const state: SlotState = {
      status: 'picked',
      file: fileOf('a.jpg', 'image/jpeg', 1024),
      previewUrl: 'blob:preview',
    }
    renderSection(api({ 's-foto': state }), {
      title: 'Foto Kendaraan',
      slots: [PHOTO],
      cols: 4,
      accept: 'image/jpeg,image/png,image/webp',
      hint: 'jpg, png, atau webp · maksimal 5 MB',
      showThumbnail: true,
    })
    expect(screen.getByRole('img', { name: /foto depan/i })).toHaveAttribute('src', 'blob:preview')
  })

  it('renders no thumbnail on a document slot', () => {
    const state: SlotState = {
      status: 'picked',
      file: fileOf('a.pdf', 'application/pdf', 1024),
      previewUrl: null,
    }
    renderSection(api({ s1: state }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
