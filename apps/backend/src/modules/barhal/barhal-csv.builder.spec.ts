import { buildBarhalCsv } from './barhal-csv.builder'

describe('buildBarhalCsv', () => {
  it('emits Origin/Destinasi columns instead of Rute', () => {
    const csv = buildBarhalCsv([
      { koliNumber: '1Jun-Kosambi-Badung-Barhal1', koliDate: '2026-06-01', originName: 'Kosambi', destName: 'Badung', totalTo: 2, weightBefore: 15, weightAfter: 20, chwt: 25 },
    ])
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('No. Koli,Tanggal,Origin,Destinasi,Total TO,Weight Before,Weight After,ChWt')
    expect(row).toBe('1Jun-Kosambi-Badung-Barhal1,2026-06-01,Kosambi,Badung,2,15,20,25')
  })
})
