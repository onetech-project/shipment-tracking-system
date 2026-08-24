import { buildBarhalCsv, BarhalCsvRow } from './barhal-csv.builder'

const EXPECTED_HEADER =
  'Date (TO),Vendor,Origin,Destination,LT Number,TO Number,Gross Weight,Qty Parcel,Remarks,' +
  'ID Packing Kayu,Berat sebelum,Berat Setelah Packing Kayu,Kenaikan Berat,SMU,Airlines,Flight No,' +
  'STD,STA,Panjang (P),Lebar (L),Tinggi (T),Volume,Jumlah Batang Kayu'

/** A fully-populated row; each test overrides only the fields it is about. */
function row(overrides: Partial<BarhalCsvRow> = {}): BarhalCsvRow {
  return {
    shipmentDate: '2026-06-01',
    vendor: 'ESP',
    originName: 'Kosambi',
    destName: 'Badung',
    ltNumber: 'LT1Q511GUY9S1',
    toNumber: 'TO20260601ABCDE',
    grossWeight: 7.44,
    qtyParcel: '1',
    remarks: 'BARHAL',
    koliNumber: '1Jun-Kosambi-Badung-Barhal1',
    weightBefore: 15,
    weightAfter: 20,
    smuNumber: '990-12345678',
    airlines: 'Garuda',
    flightNo: 'GA-712',
    std: new Date('2026-06-01T07:30:00.000Z'),
    sta: new Date('2026-06-01T09:45:00.000Z'),
    lengthCm: 120,
    widthCm: 80,
    heightCm: 60,
    volume: 0.576,
    batangKayu: 4,
    ...overrides,
  }
}

describe('buildBarhalCsv', () => {
  it('emits the 23 per-TO columns in order', () => {
    const [header, line] = buildBarhalCsv([row()]).split('\r\n')

    expect(header).toBe(EXPECTED_HEADER)
    expect(line).toBe(
      '01 Jun 2026,ESP,Kosambi,Badung,LT1Q511GUY9S1,TO20260601ABCDE,7.4,1,BARHAL,' +
        '1Jun-Kosambi-Badung-Barhal1,15.0,20.0,5.0,990-12345678,Garuda,GA-712,' +
        '01 Jun 2026 14:30,01 Jun 2026 16:45,120,80,60,0.576,4',
    )
  })

  it('renders STD/STA in WIB, not in UTC', () => {
    // 2026-06-01T17:00Z is already 2026-06-02 00:00 in Jakarta: the date must roll over.
    const [, line] = buildBarhalCsv([row({ std: new Date('2026-06-01T17:00:00.000Z') })]).split('\r\n')

    expect(line.split(',')[16]).toBe('02 Jun 2026 00:00')
  })

  it('leaves STD/STA blank when the Koli has no flight yet', () => {
    const [, line] = buildBarhalCsv([row({ std: null, sta: null })]).split('\r\n')

    const cells = line.split(',')
    expect(cells[16]).toBe('')
    expect(cells[17]).toBe('')
  })

  it('leaves dimensions blank when unmeasured, rather than reporting them as zero', () => {
    const [, line] = buildBarhalCsv([
      row({ lengthCm: null, widthCm: null, heightCm: null, volume: null, batangKayu: null }),
    ]).split('\r\n')

    expect(line.split(',').slice(18, 23)).toEqual(['', '', '', '', ''])
  })

  it('leaves Kenaikan Berat blank when either weight is missing', () => {
    const [, unweighed] = buildBarhalCsv([row({ weightAfter: null })]).split('\r\n')
    expect(unweighed.split(',')[12]).toBe('')

    const [, weighed] = buildBarhalCsv([row({ weightBefore: 15, weightAfter: 20.5 })]).split('\r\n')
    expect(weighed.split(',')[12]).toBe('5.5')
  })

  it('blanks the TO columns when the TO is no longer in the sheet', () => {
    const [, line] = buildBarhalCsv([
      row({ shipmentDate: null, vendor: null, ltNumber: null, qtyParcel: null, remarks: null, grossWeight: null }),
    ]).split('\r\n')

    const cells = line.split(',')
    expect(cells.slice(0, 2)).toEqual(['', ''])
    expect(cells[4]).toBe('')
    // Gross Weight keeps the weight columns' numeric 0.0, unlike the blanked text columns.
    expect(cells[6]).toBe('0.0')
    expect(cells.slice(7, 9)).toEqual(['', ''])
  })

  it('quotes Remarks containing a comma, so the comma is not read as a column break', () => {
    const csv = buildBarhalCsv([row({ remarks: 'BARHAL, urgent' })])
    const [, line] = csv.split('\r\n')

    expect(line).toContain(',"BARHAL, urgent",1Jun-Kosambi-Badung-Barhal1,')
  })

  it('quotes Remarks containing an LF, so a spreadsheet-authored multi-line remark stays one record', () => {
    // An LF is the likeliest of the three triggers to appear for real: Alt+Enter inside a spreadsheet
    // cell, or any pasted multi-line remark. Unquoted it would end the record mid-row.
    const csv = buildBarhalCsv([row({ remarks: 'BARHAL\nurgent' })])
    const [, line] = csv.split('\r\n')

    expect(line).toContain('"BARHAL\nurgent"')
  })

  it('quotes Remarks holding only a quote, with no comma to force the issue', () => {
    const [, line] = buildBarhalCsv([row({ remarks: 'say "hi"' })]).split('\r\n')

    expect(line).toContain(`,"say ""hi""",1Jun-Kosambi-Badung-Barhal1,`)
  })

  it('quotes Remarks containing a bare CR, so a CR-tolerant reader keeps the record whole', () => {
    // Records are separated by CRLF, so a lone CR inside a cell is not a record break here — but a
    // CR-tolerant reader (older Excel, some CSV parsers) treats it as one and splits the row apart.
    const csv = buildBarhalCsv([row({ remarks: 'BARHAL\rurgent' })])
    const [, line] = csv.split('\r\n')

    expect(line).toContain('"BARHAL\rurgent"')
  })

  it('doubles a quote inside Remarks, so the quoted cell does not end early', () => {
    // Without the doubling the cell reads as `"say "` and every later column shifts one to the left.
    const [, line] = buildBarhalCsv([row({ remarks: 'say "hi", ok' })]).split('\r\n')

    expect(line).toContain(`,"say ""hi"", ok",1Jun-Kosambi-Badung-Barhal1,`)
  })

  it('formats numerics returned as strings by the pg driver', () => {
    const [, line] = buildBarhalCsv([
      row({ grossWeight: '7.44', weightBefore: '15.25', weightAfter: '20', volume: '0.576', lengthCm: '120' }),
    ]).split('\r\n')

    const cells = line.split(',')
    expect(cells[6]).toBe('7.4')
    expect(cells[10]).toBe('15.3')
    expect(cells[11]).toBe('20.0')
    expect(cells[12]).toBe('4.8')
    expect(cells[18]).toBe('120')
    expect(cells[21]).toBe('0.576')
  })

  it('formats a shipment date given as a UTC-midnight Date', () => {
    const [, line] = buildBarhalCsv([row({ shipmentDate: new Date(Date.UTC(2026, 5, 1)) })]).split('\r\n')

    expect(line.split(',')[0]).toBe('01 Jun 2026')
  })

  /**
   * The pg driver parses a `date` column (OID 1082) into midnight in the process's LOCAL zone, so
   * on the production container — which runs TZ=Asia/Jakarta, see apps/backend/Dockerfile — a
   * stored 2026-06-01 arrives as the instant 2026-05-31T17:00Z. formatCsvDate reads UTC fields, so
   * such a value renders one day early. This test pins that real behaviour instead of blessing it:
   * it is precisely why the Date (TO) column is selected as `c.shipment_date::text`, routing
   * shipment dates through the string branch, which has no zone to get wrong.
   */
  it('renders a Jakarta-midnight Date one day early, which is why the SQL casts to text', () => {
    // Written as an absolute instant with an explicit offset, so this is the very value the
    // production container hands the builder, whichever zone jest itself happens to run in.
    const onContainer = new Date('2026-06-01T00:00:00+07:00')

    const [, line] = buildBarhalCsv([row({ shipmentDate: onContainer })]).split('\r\n')

    expect(line.split(',')[0]).toBe('31 May 2026')
  })

  it('emits one line per row, in order, with nothing carried over between rows', () => {
    const csv = buildBarhalCsv([
      row({ toNumber: 'TO20260601AAAAA', remarks: 'first' }),
      row({ toNumber: 'TO20260602BBBBB', remarks: 'second', std: null, sta: null, volume: null }),
    ])
    const lines = csv.split('\r\n')

    expect(lines).toHaveLength(3)
    expect(lines[1].split(',')[5]).toBe('TO20260601AAAAA')
    expect(lines[2].split(',')[5]).toBe('TO20260602BBBBB')
    // The second row keeps its own blanks: nothing leaks forward from the fully-populated first.
    expect(lines[1].split(',').slice(16, 18)).toEqual(['01 Jun 2026 14:30', '01 Jun 2026 16:45'])
    expect(lines[2].split(',').slice(16, 18)).toEqual(['', ''])
    expect(lines[2].split(',')[21]).toBe('')
  })

  it('emits only the header when there are no rows', () => {
    expect(buildBarhalCsv([])).toBe(EXPECTED_HEADER)
  })
})
