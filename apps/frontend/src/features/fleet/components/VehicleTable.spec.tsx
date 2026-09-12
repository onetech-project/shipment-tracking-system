import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleTable } from './VehicleTable'
import { FleetMasterRow, FleetVehicle } from '../types'

const docType = (id: string, code: string, label: string, sortOrder: number): FleetMasterRow => ({
  id,
  category: 'jenis_dokumen',
  code,
  label,
  sortOrder,
  isActive: true,
  warnDays: 30,
  defaultValidMonths: null,
  isRequired: null,
})

const DOC_TYPES = [
  docType('dt1', 'kir', 'KIR', 1),
  docType('dt2', 'stnk', 'STNK', 2),
  docType('dt3', 'servis', 'Servis Berkala', 3),
]

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  nopol: 'B9114KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: '8 ton',
  noRangka: null,
  noMesin: null,
  noBpkb: null,
  pemilikUnit: null,
  odometer: null,
  catatan: null,
  jenisArmada: { id: 'ja1', label: 'CDE' },
  kepemilikan: null,
  pool: { id: 'p1', label: 'Pool Cakung' },
  status: { id: 's1', label: 'Beroperasi' },
  driver: {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    simExpiresAt: '2027-03-14',
    simDaysLeft: 550,
    simSeverity: 'ok',
  },
  lease: null,
  documents: [
    {
      docTypeId: 'dt1',
      code: 'kir',
      label: 'KIR',
      nomor: 'JKT-1',
      issuedAt: null,
      expiresAt: '2026-09-15',
      daysLeft: 5,
      severity: 'warn',
    },
  ],
  worstSeverity: 'warn',
  minDaysLeft: 5,
  isActive: true,
  ...over,
})

const setup = (over: Partial<Parameters<typeof VehicleTable>[0]> = {}) => {
  const props = {
    rows: [vehicle()],
    docTypes: DOC_TYPES,
    isLoading: false,
    sort: 'nopol' as const,
    onSortChange: jest.fn(),
    onEdit: jest.fn(),
    onDocuments: jest.fn(),
    onArchive: jest.fn(),
    onRestore: jest.fn(),
    ...over,
  }
  render(<VehicleTable {...props} />)
  return props
}

describe('VehicleTable', () => {
  it('shows the plate', () => {
    setup()
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
  })

  it('shows the make, model and year together', () => {
    setup()
    expect(screen.getByText(/Mitsubishi Canter/)).toBeInTheDocument()
    // The year now reads twice on the row — in the Unit sub-line and in its own sortable Tahun
    // column — so this names the Unit cell rather than searching the page.
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[1]).toHaveTextContent(/2021/)
  })

  // merk, tipe, tahun, jenisArmada and pool are all nullable: a unit registered with nothing but
  // a plate is a real state. Without the fallbacks those cells render empty and read as a
  // rendering hole rather than "not recorded yet". Asserted per cell, because the document
  // columns legitimately show an em-dash of their own and a page-wide count would drown this.
  it('shows an em-dash for a vehicle with no make, model, year, class or pool', () => {
    setup({
      // kapasitas joins the same sub-line as jenisArmada and tahun, so it has to be blank too for
      // that line to fall back to the em-dash this test is about.
      rows: [
        vehicle({
          merk: null,
          tipe: null,
          tahun: null,
          kapasitas: null,
          jenisArmada: null,
          pool: null,
        }),
      ],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[1].querySelectorAll('span')[0]).toHaveTextContent(/^—$/)
    expect(cells[1].querySelectorAll('span')[1]).toHaveTextContent(/^—$/)
  })

  it('shows the assigned driver', () => {
    setup()
    expect(screen.getByText('Ahmad Fauzi')).toBeInTheDocument()
  })

  // A vehicle with nobody assigned is a normal state, not a rendering hole.
  it('says so when no driver is assigned', () => {
    setup({ rows: [vehicle({ driver: null })] })
    expect(screen.getByText(/belum ada sopir/i)).toBeInTheDocument()
  })

  // The row carries a badge per document column plus the driver's SIM, so the two backend
  // aggregates need naming rather than picking whichever badge the query happens to find first.
  const worstBadge = () => within(screen.getByTestId('worst-severity')).getByRole('img')

  it('shows the worst document severity on the row', () => {
    setup()
    expect(worstBadge()).toHaveTextContent(/Segera/)
  })

  // The number of days is the actionable part: "Segera" alone does not say whether to act today
  // or next month.
  it('shows how long the nearest document has left', () => {
    setup()
    expect(worstBadge()).toHaveTextContent(/5 hari lagi/)
  })

  // worstSeverity and minDaysLeft are two independent backend aggregates that can each come from
  // a different document — warn thresholds are per document type, so the nearest expiry is not
  // necessarily the worst one. Every single-document fixture makes both indistinguishable from
  // documents[0], so this row sources the worst severity from the second document, the fewest
  // days from the third, and leaves the first matching neither.
  it('reads worstSeverity and minDaysLeft as two independent aggregates', () => {
    setup({
      rows: [
        vehicle({
          documents: [
            {
              docTypeId: 'dt1',
              code: 'asuransi',
              label: 'Asuransi',
              nomor: 'AS-9',
              issuedAt: null,
              expiresAt: '2026-10-11',
              daysLeft: 30,
              severity: 'ok',
            },
            {
              docTypeId: 'dt2',
              code: 'kir',
              label: 'KIR',
              nomor: 'JKT-1',
              issuedAt: null,
              expiresAt: '2026-10-01',
              daysLeft: 20,
              severity: 'warn',
            },
            {
              docTypeId: 'dt3',
              code: 'pajak',
              label: 'Pajak',
              nomor: 'PJ-3',
              issuedAt: null,
              expiresAt: '2026-09-21',
              daysLeft: 10,
              severity: 'ok',
            },
          ],
          worstSeverity: 'warn',
          minDaysLeft: 10,
        }),
      ],
    })
    const badge = worstBadge()
    expect(badge).toHaveTextContent('Segera')
    expect(badge).toHaveTextContent('10 hari lagi')
    // Neither aggregate may be read off the first document.
    expect(badge).not.toHaveTextContent('Aktif')
    expect(badge).not.toHaveTextContent('30 hari lagi')
  })

  it('shows a distinct state for a vehicle with no documents', () => {
    setup({ rows: [vehicle({ documents: [], worstSeverity: 'none', minDaysLeft: null })] })
    // /Belum ada/ alone matches both the badge label and its "Belum ada tanggal" suffix, so
    // pin the whole reading: grey "no information" label plus the null-date wording.
    expect(worstBadge()).toHaveTextContent(/Belum ada\s*·\s*Belum ada tanggal/)
  })

  it('renders the empty state when there are no rows', () => {
    setup({ rows: [] })
    expect(screen.getByText(/belum ada armada/i)).toBeInTheDocument()
  })

  it('renders the loading state', () => {
    setup({ rows: [], isLoading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  // The three inline buttons are now one ⋮ menu (spec §7.2), so each action test opens the menu
  // for the row it means before choosing from it. Radix opens on pointerdown guarded by
  // button === 0, so fireEvent.click alone leaves the menu shut.
  const openMenu = (index = 0) =>
    fireEvent(
      screen.getAllByRole('button', { name: /aksi/i })[index],
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    )

  it('opens the edit dialog for a row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ubah' }))
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('opens the documents dialog for a row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dokumen' }))
    expect(props.onDocuments).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('archives a live row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arsipkan' }))
    expect(props.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  // An archived row offers restore instead of archive — offering both, or neither, is what makes
  // the archive view unusable.
  it('offers restore instead of archive on an archived row', () => {
    const props = setup({ rows: [vehicle({ isActive: false })] })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Arsipkan' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pulihkan' }))
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('marks an archived row visibly', () => {
    setup({ rows: [vehicle({ isActive: false })] })
    expect(screen.getByText(/arsip/i)).toBeInTheDocument()
  })

  it('renders one row per vehicle', () => {
    setup({ rows: [vehicle(), vehicle({ id: 'v2', nopol: 'B2000XX' })] })
    expect(screen.getAllByTestId('vehicle-row')).toHaveLength(2)
    expect(screen.getByText('B2000XX')).toBeInTheDocument()
  })

  // What a per-vehicle key actually buys is node identity across a re-sort: keyed by id, React
  // moves the existing <tr>; keyed by anything shared or positional it reuses nodes in place and
  // silently corrupts reconciliation. Asserted on the DOM node rather than by sniffing React's
  // duplicate-key warning, whose wording is not ours to depend on.
  it('keeps each row on its own DOM node when the list re-sorts', () => {
    const a = vehicle()
    const b = vehicle({ id: 'v2', nopol: 'B2000XX' })
    const props = {
      docTypes: DOC_TYPES,
      isLoading: false,
      sort: 'nopol' as const,
      onSortChange: jest.fn(),
      onEdit: jest.fn(),
      onDocuments: jest.fn(),
      onArchive: jest.fn(),
      onRestore: jest.fn(),
    }
    const { rerender } = render(<VehicleTable {...props} rows={[a, b]} />)
    const firstNode = screen.getByText('B9114KYZ').closest('tr')
    rerender(<VehicleTable {...props} rows={[b, a]} />)
    expect(screen.getByText('B9114KYZ').closest('tr')).toBe(firstNode)
  })

  // Pool rides under the driver and the unit status under the plate, as in the prototype: with a
  // column per document type there is no room left for two columns holding one word each.
  it('shows the pool under the driver and the unit status under the plate', () => {
    setup({ rows: [vehicle({ pool: { id: 'p9', label: 'Pool Bekasi' } })] })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[0]).toHaveTextContent('Beroperasi')
    expect(cells[4]).toHaveTextContent('Pool Bekasi')
  })

  it('sorts by plate when the plate header is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /nopol/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('-nopol')
  })

  // Clicking the active sort header flips its direction rather than re-applying the same order.
  it('flips the direction when the active sort header is clicked again', () => {
    const props = setup({ sort: '-nopol' })
    fireEvent.click(screen.getByRole('button', { name: /nopol/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('nopol')
  })

  it('sorts by year when the year header is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /tahun/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('tahun')
  })

  it('flips the year header to ascending when it is already descending', () => {
    const props = setup({ sort: '-tahun' })
    fireEvent.click(screen.getByRole('button', { name: /tahun/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('tahun')
  })

  // The arrow is the only indication of which column is driving the order and in which
  // direction. Collapsed to one neutral glyph it silently stops telling the operator anything.
  it.each([
    ['nopol', /nopol/i, 'lucide-arrow-up'],
    ['-nopol', /nopol/i, 'lucide-arrow-down'],
    ['tahun', /tahun/i, 'lucide-arrow-up'],
    ['-tahun', /tahun/i, 'lucide-arrow-down'],
  ] as const)('draws the direction arrow while sorted by %s', (sort, labelRe, icon) => {
    setup({ sort })
    expect(screen.getByRole('button', { name: labelRe }).querySelector('svg')).toHaveClass(icon)
  })

  it('draws the neutral arrow on a header that is not the active sort', () => {
    setup({ sort: 'severity' })
    expect(screen.getByRole('button', { name: /nopol/i }).querySelector('svg')).toHaveClass(
      'lucide-arrow-up-down',
    )
    expect(screen.getByRole('button', { name: /tahun/i }).querySelector('svg')).toHaveClass(
      'lucide-arrow-up-down',
    )
  })

  it('sorts by severity when the document header is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Urutkan dokumen' }))
    expect(props.onSortChange).toHaveBeenCalledWith('severity')
  })

  // The page hides actions the operator lacks permission for. A default of "show everything"
  // keeps every existing caller working; a default of "hide" would blank the column silently.
  it('shows every action when showActions is not given', () => {
    setup()
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Ubah' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Arsipkan' })).toBeInTheDocument()
  })

  it('hides the actions it is told to hide', () => {
    setup({ showActions: { edit: false, documents: true, archive: false } })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Arsipkan' })).not.toBeInTheDocument()
  })

  // Requirement #4: a column per document type, its dates visible on the row rather than hidden
  // behind one aggregate badge.
  it('renders a column per active document type, in master-data order', () => {
    setup()
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Tahun/),
      'Sopir & SIM',
      'KIR',
      'STNK',
      'Servis Berkala',
      expect.stringMatching(/Terdekat/),
      'Aksi',
    ])
  })

  it('shows the expiry date and the severity chip in a document cell', () => {
    setup()
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[5]).toHaveTextContent('15 Sep 2026')
    expect(cells[5]).toHaveTextContent(/5 hari lagi/)
  })

  // The cell is matched to its column by docTypeId. Matched by position, a unit missing its KIR
  // would shift every later document one column left and report the wrong dates under every
  // heading — all of them plausible. The document's own code is deliberately the KIR type's,
  // crossed against its STNK docTypeId: a cell matched on anything but the id lands in the wrong
  // column, and every fixture where the two agree would call that green.
  it('leaves a document cell empty when the unit has no such document', () => {
    setup({
      rows: [
        vehicle({
          documents: [
            {
              docTypeId: 'dt2',
              code: 'kir',
              label: 'STNK',
              nomor: 'A-1',
              issuedAt: null,
              expiresAt: '2031-01-10',
              daysLeft: 1000,
              severity: 'ok',
            },
          ],
        }),
      ],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[5]).toHaveTextContent('—')
    expect(cells[6]).toHaveTextContent('10 Jan 2031')
  })

  // Spec §8 pins this one by name: docTypes arrives from a query that has not resolved at first
  // paint, and a table that throws on an empty list takes the whole page down before the operator
  // sees a single row.
  it('renders its fixed columns while the document types are still loading', () => {
    setup({ docTypes: [] })
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Tahun/),
      'Sopir & SIM',
      expect.stringMatching(/Terdekat/),
      'Aksi',
    ])
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
  })

  // An inactive type is one the admin has retired. Its column would be a heading with nothing
  // under it on every row.
  it('leaves out a document type that is no longer active', () => {
    const retired = { ...docType('dt9', 'lama', 'Dokumen Lama', 4), isActive: false }
    setup({ docTypes: [...DOC_TYPES, retired] })
    expect(screen.queryByText('Dokumen Lama')).not.toBeInTheDocument()
  })

  // The licence belongs to the driver and its severity is computed by the backend like every
  // other; showing it on the row is what makes an expiring SIM visible without opening the unit.
  it('shows the driver SIM expiry and its severity', () => {
    setup()
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[4]).toHaveTextContent('14 Mar 2027')
  })

  it('shows the ownership and the leasing company', () => {
    setup({
      rows: [
        vehicle({
          kepemilikan: { id: 'kp1', label: 'Milik ESP' },
          lease: {
            id: 'lc1',
            leasing: { id: 'ls1', label: 'MTF' },
            nomorKontrak: 'MTF-1',
            cicilanPerBulan: 8750000,
            tenorBulan: 36,
            angsuranMulai: '2026-01-10',
            angsuranTerbayarOverride: null,
            angsuranTerbayar: 9,
            sisaAngsuran: 27,
            sisaKewajiban: 236250000,
          },
        }),
      ],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[2]).toHaveTextContent('Milik ESP')
    expect(cells[2]).toHaveTextContent('MTF')
    // sisaAngsuran is the backend's figure, rendered as delivered.
    expect(cells[2]).toHaveTextContent(/sisa 27/)
  })

  it('says so for a unit with no open lease contract', () => {
    setup({ rows: [vehicle({ kepemilikan: { id: 'kp1', label: 'Milik ESP' }, lease: null })] })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[2]).toHaveTextContent('Milik ESP')
    expect(cells[2]).not.toHaveTextContent(/sisa/)
  })

  // Spec §7.2: a menu with every item filtered out is not rendered at all. An empty ⋮ that opens
  // onto nothing is worse than no button, because the operator keeps trying it.
  it('renders no action menu at all when every action is hidden', () => {
    setup({ showActions: { edit: false, documents: false, archive: false } })
    expect(screen.queryByRole('button', { name: /aksi/i })).not.toBeInTheDocument()
  })

  // Spec §7.1: with ~13 columns the table scrolls sideways, and a row that has scrolled its plate
  // off the screen has lost the only thing identifying it.
  it('keeps the plate column pinned while the table scrolls sideways', () => {
    setup()
    const plateCell = screen.getByTestId('vehicle-row').querySelectorAll('td')[0]
    expect(plateCell.className).toMatch(/sticky/)
    expect(document.querySelectorAll('th')[0].className).toMatch(/sticky/)
  })
})
