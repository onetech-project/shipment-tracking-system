import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleFormDialog } from './VehicleFormDialog'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'pool',
  code: 'm1',
  label: 'M1',
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const docTypes: FleetMasterRow[] = [
  master({ id: 'dt-stnk', category: 'jenis_dokumen', code: 'stnk', label: 'STNK', sortOrder: 1, isRequired: true }),
  master({ id: 'dt-kir', category: 'jenis_dokumen', code: 'kir', label: 'KIR', sortOrder: 2, defaultValidMonths: 6 }),
  master({ id: 'dt-servis', category: 'jenis_dokumen', code: 'servis', label: 'Servis Berkala', sortOrder: 3 }),
]

const masterData = {
  jenisArmada: [master({ id: 'ja1', category: 'jenis_armada', label: 'Colt Diesel Engkel' })],
  kepemilikan: [
    master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
    master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
  ],
  leasing: [master({ id: 'ls1', category: 'leasing', code: 'mtf', label: 'MTF' })],
  pool: [master({ id: 'p1', category: 'pool', label: 'Pool Cakung' })],
  status: [master({ id: 's1', category: 'status_kendaraan', label: 'Beroperasi' })],
  jenisDokumen: docTypes,
}

const driver: FleetDriver = {
  id: 'dr1',
  nama: 'Ahmad Fauzi',
  telepon: null,
  simNomor: '3201-1122-3344',
  simJenisId: null,
  simExpiresAt: '2027-03-14',
  isActive: true,
}

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleFormDialog
      open
      masterData={masterData}
      drivers={[driver]}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

const set = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

// Fills only what spec §5.1 makes mandatory, so a test that adds nothing gets past validation
// and a test that clears one field sees exactly one error.
const fillRequired = () => {
  set(/nomor polisi/i, 'B9114KYZ')
  set(/merk/i, 'Mitsubishi')
  set(/^tipe/i, 'Canter FE 74 HD')
  set(/jenis armada/i, 'ja1')
  set(/tahun pembuatan/i, '2021')
  set(/kapasitas muatan/i, '8 ton')
  set(/nomor rangka/i, 'MHM111')
  set(/nomor mesin/i, '4D34-1')
  set(/nomor bpkb/i, 'M-01')
  set(/status kepemilikan/i, 'kp-esp')
  set(/perusahaan leasing/i, 'ls1')
  set(/nomor kontrak/i, 'MTF-1')
  set(/cicilan/i, '8750000')
  set(/total angsuran/i, '36')
  set(/tanggal angsuran pertama/i, '2026-01-10')
  set(/pool/i, 'p1')
  set(/masa berlaku stnk/i, '2031-01-10')
}

describe('VehicleFormDialog', () => {
  // Requirement #1: all six sections in one form, each a real fieldset so a screen reader
  // announces which one the operator has tabbed into.
  it('renders all six sections', () => {
    setup()
    // Exact strings, not substrings: the legend is what a screen reader announces, and
    // /uji berkala/i would go on matching a legend that had lost half its name.
    for (const name of [
      'Identitas Kendaraan',
      'Kepemilikan & Leasing',
      'Operasional & Sopir',
      'Uji Berkala (KIR)',
      'Dokumen Kendaraan',
      'Servis dan Perawatan',
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument()
    }
  })

  it('names the dialog for what it is doing', () => {
    setup()
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  it('names the dialog Ubah when editing', () => {
    setup({ initial: { id: 'v1', nopol: 'B9114KYZ', documents: [] } as unknown as FleetVehicle })
    expect(screen.getByRole('heading', { name: /ubah armada/i })).toBeInTheDocument()
  })

  // The split is by code, and it decides which of three sections each document lands in. Wrong,
  // and KIR appears among the general documents with the wrong labels around it.
  it('puts KIR in its own section', () => {
    setup()
    const kir = screen.getByRole('group', { name: 'Uji Berkala (KIR)' })
    expect(kir).toContainElement(screen.getByLabelText(/tanggal uji kir/i))
    expect(kir).toContainElement(screen.getByLabelText(/masa berlaku kir sampai/i))
  })

  // Each of the three splits is exclusive, and duplicate ids are why that needs saying out
  // loud: a KIR rendered into the general section too would emit a second input carrying the
  // same id, which getByLabelText silently resolves to the first one — so the section-contains
  // assertions above all stay green while the operator sees the document twice.
  it('renders each document exactly once across the three sections', () => {
    setup()
    for (const label of [
      /tanggal uji kir/i,
      /masa berlaku kir sampai/i,
      /masa berlaku stnk/i,
      /servis berkala terakhir/i,
      /servis berkala berikutnya/i,
    ]) {
      expect(screen.queryAllByLabelText(label)).toHaveLength(1)
    }
  })

  // The other half of the split: KIR and servis are carved OUT of the general section, not
  // merely copied into their own. Asserted by id, since a duplicate is what this guards.
  it('keeps KIR and the service record out of the general document section', () => {
    setup()
    const dokumen = screen.getByRole('group', { name: 'Dokumen Kendaraan' })
    for (const id of ['vf-doc-dt-kir-expires', 'vf-doc-dt-servis-expires']) {
      expect(dokumen.querySelector(`#${id}`)).toBeNull()
    }
    expect(dokumen.querySelector('#vf-doc-dt-stnk-expires')).not.toBeNull()
  })

  it('puts the service record in the servis section', () => {
    setup()
    const servis = screen.getByRole('group', { name: 'Servis dan Perawatan' })
    expect(servis).toContainElement(screen.getByLabelText(/servis berkala terakhir/i))
    expect(servis).toContainElement(screen.getByLabelText(/servis berkala berikutnya/i))
  })

  it('puts every other document type in the dokumen section', () => {
    setup()
    const dokumen = screen.getByRole('group', { name: /dokumen kendaraan/i })
    expect(dokumen).toContainElement(screen.getByLabelText(/masa berlaku stnk/i))
  })

  // An admin can add a document type at any time; it must land somewhere rather than vanish.
  it('puts an unknown document type in the dokumen section', () => {
    setup({
      masterData: {
        ...masterData,
        jenisDokumen: [
          ...docTypes,
          master({ id: 'dt-tera', category: 'jenis_dokumen', code: 'sertifikat_tera', label: 'Sertifikat Tera' }),
        ],
      },
    })
    const dokumen = screen.getByRole('group', { name: /dokumen kendaraan/i })
    expect(dokumen).toContainElement(screen.getByLabelText(/sertifikat tera berlaku sampai/i))
  })

  // Section 6 writes to fleet_vehicles.catatan, not to a document row — it is the one field on
  // that section that is not a date.
  it('keeps the free-text note in the servis section', () => {
    setup()
    expect(screen.getByRole('group', { name: /servis dan perawatan/i })).toContainElement(
      screen.getByLabelText(/catatan/i),
    )
  })

  // Requirement §4: six months after the test date, from the master row's defaultValidMonths.
  it('pre-fills the KIR expiry six months after the test date', () => {
    setup()
    set(/tanggal uji kir/i, '2026-03-10')
    expect(screen.getByLabelText(/masa berlaku kir sampai/i)).toHaveValue('2026-09-10')
  })

  // Spec §6.1: only into a still-empty box. A date the operator read off the paper document
  // outranks one this arithmetic guessed.
  it('leaves a KIR expiry the operator already typed alone', () => {
    setup()
    set(/masa berlaku kir sampai/i, '2026-12-31')
    set(/tanggal uji kir/i, '2026-03-10')
    expect(screen.getByLabelText(/masa berlaku kir sampai/i)).toHaveValue('2026-12-31')
  })

  it('refuses to submit an empty form and says which field', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib diisi/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses to submit without the mandatory documents', async () => {
    const { onSubmit } = setup()
    fillRequired()
    set(/masa berlaku stnk/i, '')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/masa berlaku stnk wajib diisi/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The whole form arrives as one payload, so the backend can write the vehicle, its contract
  // and its documents in one transaction (spec §5).
  it('sends the vehicle, the lease and the documents together', async () => {
    const { onSubmit } = setup()
    fillRequired()
    set(/tanggal uji kir/i, '2026-03-10')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toMatchObject({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      poolId: 'p1',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: null,
      },
    })
    expect(payload.documents).toEqual(
      expect.arrayContaining([
        { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
        { docTypeId: 'dt-kir', nomor: null, issuedAt: '2026-03-10', expiresAt: '2026-09-10' },
      ]),
    )
  })

  it('leaves untouched document rows out of the payload', async () => {
    const { onSubmit } = setup()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].documents).toEqual([
      { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
    ])
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The 409 from a duplicate plate is the likeliest error here and the backend's message names
  // the plate. Swallowing it for a generic string loses the only useful part.
  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Plate "B9114KYZ" is already registered' } },
    })
    setup({ onSubmit })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('stays open when the save fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'))
    const { onClose } = setup({ onSubmit })
    fillRequired()
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
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  // Without preventDefault the browser navigates away on submit and the operator loses a
  // 22-field form. Nothing else in the suite notices, because jsdom does not navigate.
  it('prevents the browser default form submit', () => {
    setup()
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
  // operator inside it with no exit.
  it('closes without saving when dismissed with Escape', async () => {
    const { onSubmit, onClose } = setup()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // jenisDokumen arrives from a query that has not resolved at first paint. The three document
  // sections must render empty rather than throw and take the dialog down with them.
  it('still opens while the document types are loading', () => {
    setup({ masterData: { ...masterData, jenisDokumen: [] } })
    expect(screen.getByRole('group', { name: /dokumen kendaraan/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/nomor polisi/i)).toBeInTheDocument()
  })
})
