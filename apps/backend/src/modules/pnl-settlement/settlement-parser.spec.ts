import * as XLSX from 'xlsx'
import { parseSettlementWorkbook } from './settlement-parser'

// Builds an .xlsx buffer from a map of sheetName -> array-of-arrays.
function makeWorkbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// A realistic detail sheet: 3 title rows, header at row 4, then data. Mirrors "Origin DPS 1-15".
function detailSheet(
  rows: Array<{ lt: string; to: string; amount: number | string | null; packing?: number | string }>,
  opts: { packingHeader?: string; amountFirst?: boolean } = {},
): unknown[][] {
  const packingHeader = opts.packingHeader ?? 'Packing Kayu ((P+L+T)*1000)'
  // Default column order: LT, TO, Weight, Packing, Amount
  const header = opts.amountFirst
    ? ['Date', 'Amount', 'LT Number', 'TO Number', packingHeader]
    : ['Date', 'LT Number', 'TO Number', 'Weight (Kg)', packingHeader, 'Amount']
  const aoa: unknown[][] = [
    ['Recapitulation SPX'],
    ['PT Eka Satya Puspita'],
    ['Period: 01-15 March 2026'],
    header,
  ]
  for (const r of rows) {
    aoa.push(
      opts.amountFirst
        ? ['46067', r.amount, r.lt, r.to, r.packing ?? null]
        : ['46067', r.lt, r.to, 0.866, r.packing ?? null, r.amount],
    )
  }
  return aoa
}

describe('parseSettlementWorkbook', () => {
  it('extracts lt/to and computes actualRevenue = amount + packing from a detail sheet', () => {
    const buf = makeWorkbook({
      'Origin DPS 1-15': detailSheet([
        { lt: 'LT001', to: 'TO001', amount: 10000, packing: 500 },
        { lt: 'LT001', to: 'TO002', amount: 20000 }, // no packing -> +0
      ]),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows).toEqual([
      expect.objectContaining({ ltNumber: 'LT001', toNumber: 'TO001', actualRevenue: 10500 }),
      expect.objectContaining({ ltNumber: 'LT001', toNumber: 'TO002', actualRevenue: 20000 }),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('matches columns by header name regardless of their position', () => {
    const buf = makeWorkbook({
      A: detailSheet([{ lt: 'LT001', to: 'TO001', amount: 100 }]),
      B: detailSheet([{ lt: 'LT002', to: 'TO002', amount: 200 }], { amountFirst: true }),
    })
    const res = parseSettlementWorkbook(buf)
    const byTo = Object.fromEntries(res.rows.map((r) => [r.toNumber, r.actualRevenue]))
    expect(byTo).toEqual({ TO001: 100, TO002: 200 })
  })

  it('matches packing kayu header by prefix (suffix varies *500/*1000)', () => {
    const buf = makeWorkbook({
      S: detailSheet([{ lt: 'LT001', to: 'TO001', amount: 100, packing: 50 }], {
        packingHeader: 'Packing Kayu ((P+L+T)*500)',
      }),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows[0].actualRevenue).toBe(150)
  })

  it('skips sheets without lt/to/amount headers (Summary, Deduction)', () => {
    const buf = makeWorkbook({
      Summary: [
        ['Summary'],
        ['Destination', 'Jumlah (Kg)', 'Discount', 'Total Harga'],
        ['Gunung Sitoli', 10, 0, 1000],
      ],
      Deduction: [
        ['Deduction'],
        ['No', 'Order ID', 'Claim', 'Amount Claim', 'LT Number', 'TO Number'],
        ['1', 'X', 'damage', 5000, 'LT999', 'TO999'],
      ],
      Detail: detailSheet([{ lt: 'LT001', to: 'TO001', amount: 100 }]),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows.map((r) => r.toNumber)).toEqual(['TO001'])
    expect(res.sheetSummary.find((s) => s.sheet === 'Deduction')?.detected).toBe(false)
    expect(res.sheetSummary.find((s) => s.sheet === 'Detail')?.detected).toBe(true)
  })

  it('skips Total and blank rows, and blank lt/to keys', () => {
    const aoa = detailSheet([{ lt: 'LT001', to: 'TO001', amount: 100 }])
    aoa.push(['Total', '', '', '', '', 999]) // subtotal row, no lt/to
    aoa.push([]) // blank row
    const buf = makeWorkbook({ D: aoa })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].toNumber).toBe('TO001')
  })

  it('reports an error row when amount is missing/non-numeric but lt/to present', () => {
    const buf = makeWorkbook({
      D: detailSheet([
        { lt: 'LT001', to: 'TO001', amount: null },
        { lt: 'LT002', to: 'TO002', amount: 'DO' },
        { lt: 'LT003', to: 'TO003', amount: 300 },
      ]),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows.map((r) => r.toNumber)).toEqual(['TO003'])
    expect(res.errors).toHaveLength(2)
  })

  it('dedupes by (lt,to) across sheets with last-wins and counts duplicates', () => {
    const buf = makeWorkbook({
      A: detailSheet([{ lt: 'LT001', to: 'TO001', amount: 100 }]),
      B: detailSheet([{ lt: 'LT001', to: 'TO001', amount: 999 }]),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].actualRevenue).toBe(999) // last wins
    expect(res.duplicateCount).toBe(1)
    expect(res.warnings.length).toBeGreaterThan(0)
  })

  it('parses comma-formatted numeric strings', () => {
    const buf = makeWorkbook({
      D: detailSheet([{ lt: 'LT001', to: 'TO001', amount: '1,234.50', packing: '1,000' }]),
    })
    const res = parseSettlementWorkbook(buf)
    expect(res.rows[0].actualRevenue).toBeCloseTo(2234.5)
  })
})
