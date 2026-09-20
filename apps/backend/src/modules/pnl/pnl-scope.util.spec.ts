import { parseScope } from './pnl-scope.util'

describe('parseScope', () => {
  it('returns an empty filter when nothing is supplied', () => {
    expect(parseScope({})).toEqual({})
  })

  it('omits fields rather than sending them empty', () => {
    // routeToParams on the frontend drops undefined fields; an empty array would serialise as a
    // filter matching nothing, which reads to the user as a real (empty) answer.
    expect(parseScope({ routes: '', dateFrom: '', dateTo: '', vendor: [] })).toEqual({})
  })

  it('parses route pairs on the pipe, deduping repeats', () => {
    expect(parseScope({ routes: 'Jabo|Aceh,Jabo|Aceh,Surabaya|Batam' })).toEqual({
      routes: [
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Surabaya', dest: 'Batam' },
      ],
    })
  })

  it('passes the dates straight through', () => {
    expect(parseScope({ dateFrom: '2026-05-01', dateTo: '2026-05-15' })).toEqual({
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  it('reads a single vendor, several vendors, and the qs arrayLimit object alike', () => {
    expect(parseScope({ vendor: 'ESP' })).toEqual({ vendors: ['ESP'] })
    expect(parseScope({ vendor: ['ESP', 'Angkasa'] })).toEqual({ vendors: ['ESP', 'Angkasa'] })
    // Past qs's arrayLimit of 20 occurrences the param arrives as a plain object keyed by index.
    expect(parseScope({ vendor: { 0: 'ESP', 1: 'Angkasa' } })).toEqual({
      vendors: ['ESP', 'Angkasa'],
    })
  })

  it('rejects a malformed route pair loudly', () => {
    // A silently dropped route reads to the user as "nothing flew here", which is
    // indistinguishable from a real answer.
    expect(() => parseScope({ routes: 'JaboAceh' })).toThrow()
  })
})
