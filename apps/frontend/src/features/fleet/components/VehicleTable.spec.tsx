import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleTable } from './VehicleTable'
import { FleetVehicle } from '../types'

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  nopol: 'B 9114 KYZ',
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
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
  })

  it('shows the make, model and year together', () => {
    setup()
    expect(screen.getByText(/Mitsubishi Canter/)).toBeInTheDocument()
    expect(screen.getByText(/2021/)).toBeInTheDocument()
  })

  // merk, tipe, tahun, jenisArmada and pool are all nullable: a unit registered with nothing but
  // a plate is a real state. Without the fallbacks those cells render empty and read as a
  // rendering hole rather than "not recorded yet". Asserted per cell so dropping any one of the
  // three fallbacks is caught on its own.
  it('shows an em-dash for a vehicle with no make, model, year, class or pool', () => {
    setup({
      rows: [vehicle({ merk: null, tipe: null, tahun: null, jenisArmada: null, pool: null })],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[1].querySelectorAll('span')[0]).toHaveTextContent(/^—$/)
    expect(cells[1].querySelectorAll('span')[1]).toHaveTextContent(/^—$/)
    expect(cells[3]).toHaveTextContent(/^—$/)
    expect(screen.getAllByText('—')).toHaveLength(3)
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

  it('shows the worst document severity on the row', () => {
    setup()
    expect(screen.getByText(/Segera/)).toBeInTheDocument()
  })

  // The number of days is the actionable part: "Segera" alone does not say whether to act today
  // or next month.
  it('shows how long the nearest document has left', () => {
    setup()
    expect(screen.getByText(/5 hari lagi/)).toBeInTheDocument()
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
    const badge = screen.getByRole('img')
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
    expect(screen.getByRole('img')).toHaveTextContent(/Belum ada\s*·\s*Belum ada tanggal/)
  })

  it('renders the empty state when there are no rows', () => {
    setup({ rows: [] })
    expect(screen.getByText(/belum ada armada/i)).toBeInTheDocument()
  })

  it('renders the loading state', () => {
    setup({ rows: [], isLoading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('opens the edit dialog for a row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /ubah/i }))
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('opens the documents dialog for a row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Dokumen' }))
    expect(props.onDocuments).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('archives a live row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /arsipkan/i }))
    expect(props.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  // An archived row offers restore instead of archive — offering both, or neither, is what makes
  // the archive view unusable.
  it('offers restore instead of archive on an archived row', () => {
    const props = setup({ rows: [vehicle({ isActive: false })] })
    expect(screen.queryByRole('button', { name: /arsipkan/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }))
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('marks an archived row visibly', () => {
    setup({ rows: [vehicle({ isActive: false })] })
    expect(screen.getByText(/arsip/i)).toBeInTheDocument()
  })

  it('renders one row per vehicle', () => {
    setup({ rows: [vehicle(), vehicle({ id: 'v2', nopol: 'B 2000 XX' })] })
    expect(screen.getAllByTestId('vehicle-row')).toHaveLength(2)
    expect(screen.getByText('B 2000 XX')).toBeInTheDocument()
  })

  // What a per-vehicle key actually buys is node identity across a re-sort: keyed by id, React
  // moves the existing <tr>; keyed by anything shared or positional it reuses nodes in place and
  // silently corrupts reconciliation. Asserted on the DOM node rather than by sniffing React's
  // duplicate-key warning, whose wording is not ours to depend on.
  it('keeps each row on its own DOM node when the list re-sorts', () => {
    const a = vehicle()
    const b = vehicle({ id: 'v2', nopol: 'B 2000 XX' })
    const props = {
      isLoading: false,
      sort: 'nopol' as const,
      onSortChange: jest.fn(),
      onEdit: jest.fn(),
      onDocuments: jest.fn(),
      onArchive: jest.fn(),
      onRestore: jest.fn(),
    }
    const { rerender } = render(<VehicleTable {...props} rows={[a, b]} />)
    const firstNode = screen.getByText('B 9114 KYZ').closest('tr')
    rerender(<VehicleTable {...props} rows={[b, a]} />)
    expect(screen.getByText('B 9114 KYZ').closest('tr')).toBe(firstNode)
  })

  it('shows the pool and the unit status in their own columns', () => {
    setup({ rows: [vehicle({ pool: { id: 'p9', label: 'Pool Bekasi' } })] })
    expect(screen.getByText('Pool Bekasi')).toBeInTheDocument()
    expect(screen.getByText('Beroperasi')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arsipkan' })).toBeInTheDocument()
  })

  it('hides the actions it is told to hide', () => {
    setup({ showActions: { edit: false, documents: true, archive: false } })
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arsipkan' })).not.toBeInTheDocument()
  })
})
