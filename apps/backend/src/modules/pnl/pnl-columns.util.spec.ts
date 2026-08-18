import { BadRequestException } from '@nestjs/common'
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'

describe('parseRoutePairs', () => {
  it('splits comma-separated origin|dest pairs and keeps spaces inside a station name', () => {
    expect(parseRoutePairs('Jabo|Denpasar, Surabaya|Tanjung Pinang')).toEqual([
      { origin: 'Jabo', dest: 'Denpasar' },
      { origin: 'Surabaya', dest: 'Tanjung Pinang' },
    ])
  })

  it('returns nothing for an absent or empty param', () => {
    expect(parseRoutePairs(undefined)).toEqual([])
    expect(parseRoutePairs('')).toEqual([])
    expect(parseRoutePairs('  ,  ')).toEqual([])
  })

  it('drops a duplicate pair so it cannot be counted twice', () => {
    expect(parseRoutePairs('Jabo|Aceh,Jabo|Aceh')).toEqual([{ origin: 'Jabo', dest: 'Aceh' }])
  })

  it.each(['Jabo', 'Jabo|', '|Aceh', 'Jabo|Aceh|Extra'])(
    'rejects the malformed pair %p rather than filtering on a half-empty station',
    (raw) => {
      expect(() => parseRoutePairs(raw)).toThrow(BadRequestException)
    },
  )
})

describe('parseColumnPicks', () => {
  it('keeps groups and routes in the order they were picked', () => {
    expect(parseColumnPicks(`g:${G1},r:Jabo|Denpasar,g:${G2}`)).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
      { kind: 'group', id: G2 },
    ])
  })

  it('drops a repeated pick, keeping its first position', () => {
    // A repeat would otherwise overwrite the earlier column in the index built from these picks,
    // leaving that column permanently null.
    expect(parseColumnPicks(`g:${G1},r:Jabo|Aceh,g:${G1}`)).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'route', origin: 'Jabo', dest: 'Aceh' },
    ])
  })

  it('returns nothing for an absent or empty param', () => {
    expect(parseColumnPicks(undefined)).toEqual([])
    expect(parseColumnPicks('')).toEqual([])
  })

  it('rejects a group id that is not a uuid', () => {
    expect(() => parseColumnPicks('g:not-a-uuid')).toThrow(BadRequestException)
  })

  it('rejects a descriptor with no recognised prefix', () => {
    expect(() => parseColumnPicks(`${G1}`)).toThrow(BadRequestException)
    expect(() => parseColumnPicks('x:Jabo|Aceh')).toThrow(BadRequestException)
  })

  it('rejects a malformed route descriptor', () => {
    expect(() => parseColumnPicks('r:Jabo')).toThrow(BadRequestException)
  })
})
