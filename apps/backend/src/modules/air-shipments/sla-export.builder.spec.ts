import * as XLSX from 'xlsx'
import {
  buildSlaWorkbook,
  mapActiveRows,
  mapAwbRows,
  expandExcludedRows,
  cellValue,
  colLabel,
  alertLabel,
  AWB_HEADERS,
  EXCLUDE_HEADERS,
  SlaSheetSpec,
} from './sla-export.builder'

/** Read a sheet back as an array-of-arrays for assertions. */
function readSheet(buffer: Buffer, name: string): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  return XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  }) as unknown[][]
}

describe('sla-export.builder', () => {
  describe('colLabel / alertLabel', () => {
    it('uppercases snake_case keys', () => {
      expect(colLabel('lt_number')).toBe('LT NUMBER')
      expect(colLabel('ata_flight')).toBe('ATA FLIGHT')
    })

    it('maps alert keys to the frontend (English) labels, passing unknown keys through', () => {
      expect(alertLabel('melewatiSla')).toBe('SLA Breach')
      expect(alertLabel('reservasiPenerbangan')).toBe('Flight Reservations')
      expect(alertLabel('somethingElse')).toBe('somethingElse')
    })
  })

  describe('cellValue', () => {
    it('prefers own properties, then falls back to extra_fields', () => {
      const row = { lt_number: 'LT1', extra_fields: { issue: 'late', lt_number: 'IGNORED' } }
      expect(cellValue(row, 'lt_number')).toBe('LT1') // own prop wins
      expect(cellValue(row, 'issue')).toBe('late') // extra_fields fallback
      expect(cellValue(row, 'missing')).toBeUndefined()
    })
  })

  describe('mapActiveRows', () => {
    it('selects only the requested columns, in order, resolving extra_fields', () => {
      const rows = [
        { date: '2026-06-01', lt_number: 'LT1', extra_fields: { issue: 'A' } },
        { date: '2026-06-02', lt_number: 'LT2', extra_fields: { issue: 'B' } },
      ]
      expect(mapActiveRows(rows, ['lt_number', 'issue', 'date'])).toEqual([
        ['LT1', 'A', '2026-06-01'],
        ['LT2', 'B', '2026-06-02'],
      ])
    })

    it('renders missing/null values as empty strings', () => {
      expect(mapActiveRows([{ lt_number: null }], ['lt_number', 'absent'])).toEqual([['', '']])
    })
  })

  describe('expandExcludedRows', () => {
    const rows = [
      {
        to_number: 'TO1',
        lt_number: 'LT1',
        excluded_reasons: { melewatiSla: 'reason-a', spxSlaAlert: 'reason-b' },
      },
      { to_number: 'TO2', lt_number: 'LT2', excluded_reasons: { melewatiSla: 'reason-c' } },
      { to_number: 'TO3', lt_number: 'LT3', excluded_reasons: null }, // skipped
    ]

    it('expands one line per excluded alert type with mapped labels', () => {
      const out = expandExcludedRows(rows)
      expect(out).toEqual([
        ['TO1', 'LT1', 'SLA Breach', 'reason-a'],
        ['TO1', 'LT1', 'SPX SLA Alert', 'reason-b'],
        ['TO2', 'LT2', 'SLA Breach', 'reason-c'],
      ])
    })

    it('applies the alert-type chip filter', () => {
      const out = expandExcludedRows(rows, 'spxSlaAlert')
      expect(out).toEqual([['TO1', 'LT1', 'SPX SLA Alert', 'reason-b']])
    })
  })

  describe('mapAwbRows', () => {
    it('combines leg value + flight number and maps the source flag', () => {
      const out = mapAwbRows([
        {
          awb: '123-456',
          source: 'api',
          airline: 'GA',
          std_booking: '10:00',
          std_flight_no: 'GA1',
          actual_flight_dep: '11:00',
          dep_flight_no: 'GA2',
          remarks_offload: 'note',
          evidence: 'http://x',
        },
      ])
      expect(out[0][0]).toBe('123-456')
      expect(out[0][1]).toBe('API')
      expect(out[0][3]).toBe('10:00 (GA1)') // STD Booking leg
      expect(out[0][4]).toBe('11:00 (GA2)') // Actual (DEP) leg
      expect(out[0][AWB_HEADERS.indexOf('Evidence')]).toBe('http://x')
    })
  })

  describe('buildSlaWorkbook', () => {
    const active: SlaSheetSpec = {
      name: 'Active Alert',
      title: 'SLA Monitoring — Active Alerts',
      filterLines: [
        ['Date Range:', '2026-06-01 → 2026-06-15'],
        ['Alert Type:', 'SLA Breach'],
      ],
      headers: ['DATE', 'LT NUMBER'],
      rows: [
        ['2026-06-01', 'LT1'],
        ['2026-06-02', 'LT2'],
      ],
    }
    const exclude: SlaSheetSpec = {
      name: 'Exclude',
      title: 'SLA Monitoring — Excluded',
      filterLines: [['Date Range:', '2026-06-01 → 2026-06-15']],
      headers: EXCLUDE_HEADERS,
      rows: [['TO1', 'LT1', 'SLA Breach', 'reason']],
    }

    it('produces a two-sheet workbook named Active Alert + Exclude', () => {
      const wb = XLSX.read(buildSlaWorkbook(active, exclude), { type: 'buffer' })
      expect(wb.SheetNames).toEqual(['Active Alert', 'Exclude'])
    })

    it('writes title, filter lines, a blank spacer, headers, then data rows', () => {
      const aoa = readSheet(buildSlaWorkbook(active, exclude), 'Active Alert')
      expect(aoa[0][0]).toBe('SLA Monitoring — Active Alerts')
      expect(aoa[1]).toEqual(['Date Range:', '2026-06-01 → 2026-06-15'])
      expect(aoa[2]).toEqual(['Alert Type:', 'SLA Breach'])
      // row 3 is the blank spacer, row 4 the headers
      expect(aoa[4]).toEqual(['DATE', 'LT NUMBER'])
      expect(aoa[5]).toEqual(['2026-06-01', 'LT1'])
      expect(aoa[6]).toEqual(['2026-06-02', 'LT2'])
    })
  })
})
