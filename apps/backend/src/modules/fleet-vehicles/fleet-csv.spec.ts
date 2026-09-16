import { toCsv } from './fleet-csv'
import { FleetVehicleView } from './fleet-vehicles.types'

function row(over: Partial<FleetVehicleView> = {}): FleetVehicleView {
  return {
    id: 'v-1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    tahun: 2021,
    kapasitas: '8 ton',
    noRangka: 'MHMFE74P5MK123456',
    noMesin: '4D34T-99887',
    noBpkb: 'N-04512233',
    pemilikUnit: null,
    odometer: 184320,
    catatan: null,
    jenisArmada: { id: 'a', code: 'cdd', label: 'Colt Diesel Double' },
    kepemilikan: { id: 'b', code: 'milik_esp', label: 'Milik ESP' },
    pool: { id: 'c', code: 'cakung', label: 'Pool Cakung' },
    status: { id: 'd', code: 'aktif', label: 'Aktif' },
    driver: {
      id: 'dr',
      nama: 'Ahmad Fauzi',
      simExpiresAt: '2027-03-14',
      simDaysLeft: 186,
      simSeverity: 'ok',
    },
    lease: null,
    documents: [],
    worstSeverity: 'ok',
    minDaysLeft: 186,
    berkasCount: { ada: 2, wajib: 4 },
    isActive: true,
    ...over,
  } as FleetVehicleView
}

describe('toCsv', () => {
  it('opens with a header row', () => {
    const [header] = toCsv([row()]).split('\r\n')
    expect(header).toContain('Nomor Polisi')
    expect(header).toContain('Sisa Kewajiban')
    expect(header).toContain('Status Dokumen')
  })

  // Excel on a Windows box reads a bare UTF-8 file as Latin-1 and turns every Indonesian name
  // with an accent into mojibake. The BOM is what makes it open correctly on a double click.
  it('starts with a UTF-8 BOM', () => {
    expect(toCsv([row()]).charCodeAt(0)).toBe(0xfeff)
  })

  it('separates rows with CRLF', () => {
    const csv = toCsv([row(), row({ id: 'v-2', nopol: 'B 9222 XYZ' })])
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('writes the plate, make and master labels', () => {
    const [, first] = toCsv([row()]).split('\r\n')
    expect(first).toContain('B 9114 KYZ')
    expect(first).toContain('Mitsubishi')
    expect(first).toContain('Pool Cakung')
    expect(first).toContain('Ahmad Fauzi')
  })

  // A comma inside a field would otherwise shift every column after it by one.
  it('quotes a field containing a comma, a quote or a newline', () => {
    const csv = toCsv([row({ catatan: 'Rusak, menunggu suku cadang' })])
    expect(csv).toContain('"Rusak, menunggu suku cadang"')

    const quoted = toCsv([row({ catatan: 'Ban 22" bekas' })])
    expect(quoted).toContain('"Ban 22"" bekas"')

    const multiline = toCsv([row({ catatan: 'baris satu\nbaris dua' })])
    expect(multiline).toContain('"baris satu\nbaris dua"')
  })

  it('writes the lease figures the backend settled', () => {
    const csv = toCsv([
      row({
        lease: {
          id: 'c',
          leasing: { id: 'l', code: 'mtf', label: 'MTF' },
          nomorKontrak: 'MTF-2024-03-11872',
          cicilanPerBulan: 8750000,
          tenorBulan: 48,
          angsuranMulai: '2024-03-11',
          angsuranTerbayarOverride: null,
          angsuranTerbayar: 30,
          sisaAngsuran: 18,
          sisaKewajiban: 157500000,
          closedAt: null,
        },
      }),
    ])
    expect(csv).toContain('8750000')
    expect(csv).toContain('157500000')
    expect(csv).toContain('MTF')
  })

  it('leaves the lease columns empty for a unit with no contract', () => {
    const csv = toCsv([row({ lease: null })])
    expect(csv).toContain(',,')
  })

  // A settled contract (sisaAngsuran 0) is history, not an outstanding obligation — the same rule
  // FleetSummaryService applies when it totals sisaKewajiban across the register.
  it('leaves Sisa Kewajiban blank for a contract with nothing left to pay', () => {
    const csv = toCsv([
      row({
        lease: {
          id: 'c',
          leasing: { id: 'l', code: 'mtf', label: 'MTF' },
          nomorKontrak: 'MTF-2024-03-11872',
          cicilanPerBulan: 8750000,
          tenorBulan: 48,
          angsuranMulai: '2024-03-11',
          angsuranTerbayarOverride: null,
          angsuranTerbayar: 48,
          sisaAngsuran: 0,
          sisaKewajiban: 999999,
          closedAt: '2028-03-11',
        },
      }),
    ])
    expect(csv).not.toContain('999999')
  })

  it('writes the file count as a ratio', () => {
    expect(toCsv([row({ berkasCount: { ada: 2, wajib: 4 } })])).toContain('2/4')
  })

  it('translates severity into words an operator reads', () => {
    expect(toCsv([row({ worstSeverity: 'crit' })])).toContain('Kedaluwarsa')
    expect(toCsv([row({ worstSeverity: 'warn' })])).toContain('Segera')
    expect(toCsv([row({ worstSeverity: 'ok' })])).toContain('Aman')
    expect(toCsv([row({ worstSeverity: 'none' })])).toContain('Belum lengkap')
  })

  // One column per document type, filled from whatever that unit actually holds: the type list
  // is master data and the export must follow it rather than a hardcoded set of twelve.
  it('gives every document type met in the data its own expiry column', () => {
    const csv = toCsv([
      row({
        documents: [
          {
            docTypeId: 'dt-1',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-II/778812',
            issuedAt: '2026-03-02',
            expiresAt: '2026-09-02',
            daysLeft: -7,
            severity: 'crit',
          },
        ],
      }),
    ])
    const [header, first] = csv.split('\r\n')
    expect(header).toContain('KIR Berlaku Sampai')
    expect(first).toContain('2026-09-02')
  })

  it('returns a header-only file for an empty register', () => {
    const csv = toCsv([])
    expect(csv.split('\r\n')).toHaveLength(1)
    expect(csv).toContain('Nomor Polisi')
  })
})
