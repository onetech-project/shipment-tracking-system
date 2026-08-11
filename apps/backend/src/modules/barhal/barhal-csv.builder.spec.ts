import { buildBarhalCsv } from './barhal-csv.builder'

describe('buildBarhalCsv', () => {
  it('emits Origin/Destinasi columns instead of Rute', () => {
    const csv = buildBarhalCsv([
      { koliNumber: '1Jun-Kosambi-Badung-Barhal1', koliDate: '2026-06-01', originName: 'Kosambi', destName: 'Badung', totalTo: 2, weightBefore: 15, weightAfter: 20, chwt: 25 },
    ])
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('No. Koli,Tanggal,Origin,Destinasi,Total TO,Weight Before,Weight After,ChWt')
    expect(row).toBe('1Jun-Kosambi-Badung-Barhal1,01 Jun 2026,Kosambi,Badung,2,15.0,20.0,25.0')
  })

  it('formats a Date object from the pg driver the same way as a date string', () => {
    const csv = buildBarhalCsv([
      {
        koliNumber: '1Jun-Kosambi-Badung-Barhal1',
        koliDate: new Date(Date.UTC(2026, 5, 1)),
        originName: 'Kosambi',
        destName: 'Badung',
        totalTo: 2,
        weightBefore: 15,
        weightAfter: 20,
        chwt: 25,
      },
    ])
    const [, row] = csv.split('\r\n')
    expect(row).toBe('1Jun-Kosambi-Badung-Barhal1,01 Jun 2026,Kosambi,Badung,2,15.0,20.0,25.0')
  })

  it('formats numeric weights returned as strings by the pg driver', () => {
    const csv = buildBarhalCsv([
      {
        koliNumber: '1Jun-Kosambi-Badung-Barhal1',
        koliDate: '2026-06-01',
        originName: 'Kosambi',
        destName: 'Badung',
        totalTo: 2,
        weightBefore: '15.25',
        weightAfter: '20',
        chwt: null,
      },
    ])
    const [, row] = csv.split('\r\n')
    expect(row).toBe('1Jun-Kosambi-Badung-Barhal1,01 Jun 2026,Kosambi,Badung,2,15.3,20.0,0.0')
  })
})
