import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleDocumentsDialog } from './VehicleDocumentsDialog'
import { FleetMasterRow, FleetVehicle } from '../types'

const docType = (id: string, code: string, label: string, warnDays = 30): FleetMasterRow => ({
  id,
  category: 'jenis_dokumen',
  code,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays,
  defaultValidMonths: null,
  isRequired: null,
})

const DOC_TYPES = [docType('dt-stnk', 'stnk', 'STNK'), docType('dt-kir', 'kir', 'KIR')]

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle =>
  ({
    id: 'v1',
    nopol: 'B9114KYZ',
    documents: [],
    worstSeverity: 'none',
    minDaysLeft: null,
    isActive: true,
    ...over,
  }) as FleetVehicle

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleDocumentsDialog
      open
      vehicle={vehicle()}
      docTypes={DOC_TYPES}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

describe('VehicleDocumentsDialog', () => {
  // One row per configured type, always. A form that only shows the documents already recorded
  // gives the operator no way to add the one that is missing, which is the common case.
  it('shows a row for every configured document type', () => {
    setup()
    expect(screen.getByLabelText(/masa berlaku STNK/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/masa berlaku KIR sampai/i)).toBeInTheDocument()
  })

  // Requirement #2: the same document is called the same thing in both dialogs. "Servis Berkala
  // terbit" is not something an operator would say about a service record.
  it('names the KIR dates for what they are', () => {
    setup()
    expect(screen.getByLabelText(/tanggal uji KIR/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/masa berlaku KIR sampai/i)).toBeInTheDocument()
  })

  it('names a service record last and next, not issued and expiring', () => {
    setup({ docTypes: [docType('dt-servis', 'servis', 'Servis Berkala')] })
    expect(screen.getByLabelText(/servis berkala terakhir/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/servis berkala berikutnya/i)).toBeInTheDocument()
  })

  // The fallback half of the map (spec §6.2): a document type an admin adds is not in DOC_LABELS,
  // and must still read as a sentence rather than as a blank or a crash.
  it('falls back to the type label for a document code it does not know', () => {
    setup({ docTypes: [docType('dt-tera', 'sertifikat_tera', 'Sertifikat Tera')] })
    expect(screen.getByLabelText(/sertifikat tera terbit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sertifikat tera berlaku sampai/i)).toBeInTheDocument()
  })

  it('names the vehicle it is editing', () => {
    setup()
    expect(screen.getByText(/B9114KYZ/)).toBeInTheDocument()
  })

  it('prefills the rows from the existing documents', () => {
    setup({
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-1',
            issuedAt: '2026-03-10',
            expiresAt: '2026-09-15',
            daysLeft: 5,
            severity: 'warn',
          },
        ],
      }),
    })
    expect(screen.getByLabelText(/KIR.*nomor/i)).toHaveValue('JKT-1')
    expect(screen.getByLabelText(/tanggal uji KIR/i)).toHaveValue('2026-03-10')
    expect(screen.getByLabelText(/masa berlaku KIR sampai/i)).toHaveValue('2026-09-15')
  })

  // The badge is the reason the operator opened this dialog; recomputing it in the browser is
  // exactly what the spec forbids, so it renders the backend's severity as delivered.
  it('shows the backend severity for a document that has one', () => {
    setup({
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: null,
            issuedAt: null,
            expiresAt: '2020-01-01',
            daysLeft: -300,
            severity: 'crit',
          },
        ],
      }),
    })
    expect(screen.getByText(/Kadaluarsa/)).toBeInTheDocument()
    // The day count is part of the badge's accessible name, so asserting the label — not just the
    // colour word — is what proves daysLeft was passed through rather than dropped.
    expect(screen.getByRole('img', { name: /Kadaluarsa · Lewat 300 hari/ })).toBeInTheDocument()
  })

  // The whole set goes in one submit, including the types the operator left blank — the backend
  // retires anything absent, so omitting a filled row would silently delete that document.
  it('submits every type the operator filled in', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/masa berlaku STNK/i), {
      target: { value: '2027-05-01' },
    })
    fireEvent.change(screen.getByLabelText(/masa berlaku KIR sampai/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const sent = onSubmit.mock.calls[0][0] as { docTypeId: string }[]
    expect(sent.map((d) => d.docTypeId).sort()).toEqual(['dt-kir', 'dt-stnk'])
  })

  // An empty row is not a document. Sending it would create a live row with no data and turn the
  // badge from 'none' into a permanent grey entry.
  it('leaves out rows the operator did not fill in', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/masa berlaku KIR sampai/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1)
  })

  // The issue date is the third disjunct of the keep-this-row test, and nothing else in the suite
  // fills it alone: drop it from the predicate and a row holding only a terbit date is silently
  // discarded, retiring the document the operator was part-way through recording.
  it('keeps a row that has only an issue date', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/STNK.*terbit/i), { target: { value: '2026-02-02' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-stnk', nomor: null, issuedAt: '2026-02-02', expiresAt: null },
    ])
  })

  // A number with no expiry is still worth recording — some documents do not expire.
  it('keeps a row that has a number but no dates', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/STNK.*nomor/i), { target: { value: 'A-1' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      expect.objectContaining({ docTypeId: 'dt-stnk', nomor: 'A-1' }),
    ])
  })

  it('sends blank optional values as null', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/masa berlaku KIR sampai/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0][0].nomor).toBeNull()
    expect(onSubmit.mock.calls[0][0][0].issuedAt).toBeNull()
  })

  // The expiry is the field the badge is computed from. Left blank it has to be an explicit null:
  // a '' would reach the backend as a date it cannot parse, failing the whole transactional PUT.
  it('sends a blank expiry as null, not an empty string', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/KIR.*nomor/i), { target: { value: 'JKT-9' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-kir', nomor: 'JKT-9', issuedAt: null, expiresAt: null },
    ])
  })

  // Clearing every row is a legitimate submission that retires the lot. Blocking it would leave
  // a wrongly-entered document with no way to remove it.
  it('allows submitting an empty set', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'dt-x is not a jenis_dokumen master row' } },
    })
    setup({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/jenis_dokumen/)).toBeInTheDocument()
  })

  it('disables the submit button while saving', async () => {
    let resolve: () => void = () => {}
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)))
    setup({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  // Added beyond the brief: without preventDefault the browser navigates away on submit and the
  // operator loses every row. jsdom does not navigate, so no other test notices.
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
  // The backend retires every isCurrent row absent from this payload, so a document whose type is
  // no longer rendered — a deactivated jenis_dokumen master row, or docTypes still loading — would
  // be deleted without the operator ever seeing it. It has no row, so it must simply survive.
  it('carries through a document whose type has no rendered row', async () => {
    const { onSubmit } = setup({
      docTypes: [docType('dt-stnk', 'stnk', 'STNK')],
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-1',
            issuedAt: '2026-03-10',
            expiresAt: '2026-09-15',
            daysLeft: 5,
            severity: 'warn',
          },
        ],
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-kir', nomor: 'JKT-1', issuedAt: '2026-03-10', expiresAt: '2026-09-15' },
    ])
  })

  // rows is seeded once at mount, so a jenis_dokumen created or reactivated while the dialog is
  // open arrives in docTypes with no seeded row behind it: its blank rendered row drops out of
  // edited, and being present in docTypes it would also drop out of carry-through. The backend
  // retires whatever is absent, so that gap silently deletes a document the operator can see the
  // type of but not the data in.
  it('carries through a document whose type arrives after mount', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const withBoth = vehicle({
      documents: [
        {
          docTypeId: 'dt-stnk',
          code: 'stnk',
          label: 'STNK',
          nomor: 'A-1',
          issuedAt: '2026-01-05',
          expiresAt: '2027-05-01',
          daysLeft: 200,
          severity: 'ok',
        },
        {
          docTypeId: 'dt-kir',
          code: 'kir',
          label: 'KIR',
          nomor: 'JKT-1',
          issuedAt: '2026-03-10',
          expiresAt: '2026-09-15',
          daysLeft: 5,
          severity: 'warn',
        },
      ],
    })
    const props = {
      open: true,
      vehicle: withBoth,
      onSubmit,
      onClose: jest.fn(),
    }
    const { rerender } = render(
      <VehicleDocumentsDialog {...props} docTypes={[docType('dt-stnk', 'stnk', 'STNK')]} />,
    )
    // The same mount, not a remount — a fresh render would re-seed rows and hide the bug.
    rerender(<VehicleDocumentsDialog {...props} docTypes={DOC_TYPES} />)
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-stnk', nomor: 'A-1', issuedAt: '2026-01-05', expiresAt: '2027-05-01' },
      { docTypeId: 'dt-kir', nomor: 'JKT-1', issuedAt: '2026-03-10', expiresAt: '2026-09-15' },
    ])
  })

  // The mirror of the arrives-after-mount case, and the reason the carry-through filter is a
  // conjunction rather than a bare `in rows` check: rows is seeded once at mount, so a type that
  // LEAVES docTypes mid-mount — deactivated in the master data while the dialog is open — keeps a
  // stale seeded row it no longer renders. `docTypes.some` is the half that notices the type is
  // gone and lets the document ride along untouched; drop it for `!(d.docTypeId in rows)` and the
  // stale row excludes the document from carry-through while the shrunken docTypes excludes it
  // from edited, so the transactional PUT silently retires a document the operator never saw.
  it('carries through a document whose type leaves docTypes after mount', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const withBoth = vehicle({
      documents: [
        {
          docTypeId: 'dt-stnk',
          code: 'stnk',
          label: 'STNK',
          nomor: 'A-1',
          issuedAt: '2026-01-05',
          expiresAt: '2027-05-01',
          daysLeft: 200,
          severity: 'ok',
        },
        {
          docTypeId: 'dt-kir',
          code: 'kir',
          label: 'KIR',
          nomor: 'JKT-1',
          issuedAt: '2026-03-10',
          expiresAt: '2026-09-15',
          daysLeft: 5,
          severity: 'warn',
        },
      ],
    })
    const props = {
      open: true,
      vehicle: withBoth,
      onSubmit,
      onClose: jest.fn(),
    }
    const { rerender } = render(<VehicleDocumentsDialog {...props} docTypes={DOC_TYPES} />)
    // The same mount, not a remount — a fresh render would re-seed rows without the departed type
    // and hide the bug.
    rerender(<VehicleDocumentsDialog {...props} docTypes={[docType('dt-stnk', 'stnk', 'STNK')]} />)
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-stnk', nomor: 'A-1', issuedAt: '2026-01-05', expiresAt: '2027-05-01' },
      { docTypeId: 'dt-kir', nomor: 'JKT-1', issuedAt: '2026-03-10', expiresAt: '2026-09-15' },
    ])
  })

  // docTypes still loading renders zero rows over a live Simpan button. Submitting [] there would
  // retire every document on the vehicle in one press.
  it('submits every existing document when docTypes is empty', async () => {
    const { onSubmit } = setup({
      docTypes: [],
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-stnk',
            code: 'stnk',
            label: 'STNK',
            nomor: 'A-1',
            issuedAt: null,
            expiresAt: '2027-05-01',
            daysLeft: 200,
            severity: 'ok',
          },
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: null,
            issuedAt: '2026-03-10',
            expiresAt: null,
            daysLeft: null,
            severity: 'none',
          },
        ],
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { docTypeId: 'dt-stnk', nomor: 'A-1', issuedAt: null, expiresAt: '2027-05-01' },
      { docTypeId: 'dt-kir', nomor: null, issuedAt: '2026-03-10', expiresAt: null },
    ])
  })

  // Carried through is not the same as editable: the type has no master row to label it, so
  // rendering an input for it would be a field the operator cannot identify.
  it('does not render an editable row for a carried-through document', () => {
    setup({
      docTypes: [docType('dt-stnk', 'stnk', 'STNK')],
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-1',
            issuedAt: '2026-03-10',
            expiresAt: '2026-09-15',
            daysLeft: 5,
            severity: 'warn',
          },
        ],
      }),
    })
    expect(screen.queryByLabelText(/KIR/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('JKT-1')).not.toBeInTheDocument()
  })

  // The operator emptying a row they can see is a deliberate deletion, and the union must not
  // resurrect it — that is the only way to remove a wrongly-entered document.
  it('still retires an existing document whose row the operator cleared', async () => {
    const { onSubmit } = setup({
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-1',
            issuedAt: '2026-03-10',
            expiresAt: '2026-09-15',
            daysLeft: 5,
            severity: 'warn',
          },
        ],
      }),
    })
    fireEvent.change(screen.getByLabelText(/KIR.*nomor/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/tanggal uji KIR/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/masa berlaku KIR sampai/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
  })

  // A dialog that closes on a failed transactional PUT tells the operator the whole document set
  // saved when none of it did.
  it('stays open when the save fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'))
    const { onClose } = setup({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await screen.findByText(/terjadi kesalahan/i)
    expect(onClose).not.toHaveBeenCalled()
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
