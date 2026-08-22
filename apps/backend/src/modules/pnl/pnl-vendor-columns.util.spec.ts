import { BadRequestException } from '@nestjs/common'
import {
  MAX_VENDOR_COLUMNS,
  parseVendorColumnPicks,
  parseVendorNames,
} from './pnl-vendor-columns.util'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'

describe('parseVendorColumnPicks', () => {
  // Express + qs hands a bare string over when the param appears exactly once. Iterating that
  // string character by character is the single most likely way to break this endpoint, and it
  // breaks on the first thing any user does: pick one column.
  it('accepts a single occurrence as a bare string, not as a character sequence', () => {
    expect(parseVendorColumnPicks(`vg:${G1}`)).toEqual([{ kind: 'group', id: G1 }])
  })

  it('keeps groups and vendors in the order they arrived', () => {
    expect(parseVendorColumnPicks([`vg:${G1}`, 'v:PT Angkasa', `vg:${G2}`])).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'vendor', name: 'PT Angkasa' },
      { kind: 'group', id: G2 },
    ])
  })

  // Vendor names are free text from a Google Sheet. Splitting on ',' or '|' — the way the route
  // parser does — would shred exactly these names, which is why this param is repeated instead.
  it('keeps a vendor name that contains a comma, a pipe or a colon intact', () => {
    expect(
      parseVendorColumnPicks(['v:PT Angkasa, Tbk', 'v:CGK|SUB Logistik', 'v:Vendor: Utama']),
    ).toEqual([
      { kind: 'vendor', name: 'PT Angkasa, Tbk' },
      { kind: 'vendor', name: 'CGK|SUB Logistik' },
      { kind: 'vendor', name: 'Vendor: Utama' },
    ])
  })

  it('takes the name raw, without trimming, so it still matches v_pnl_to.vendor byte for byte', () => {
    expect(parseVendorColumnPicks(['v:  ESP  '])).toEqual([{ kind: 'vendor', name: '  ESP  ' }])
  })

  it('drops a repeated pick, keeping its first position', () => {
    expect(parseVendorColumnPicks([`vg:${G1}`, 'v:ESP', `vg:${G1}`, 'v:ESP'])).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'vendor', name: 'ESP' },
    ])
  })

  it('returns nothing for an absent param', () => {
    expect(parseVendorColumnPicks(undefined)).toEqual([])
    expect(parseVendorColumnPicks([])).toEqual([])
  })

  it('rejects a malformed descriptor rather than guessing what it meant', () => {
    expect(() => parseVendorColumnPicks(['ESP'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['x:ESP'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['vg:not-a-uuid'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['v:'])).toThrow(BadRequestException)
  })

  // A vendor name is not an id. It can disappear from the sheet between the picker loading and
  // this request, and a 400 would take the whole table down over one stale checkbox.
  it('lets an unknown vendor name through, to be rendered as an empty column', () => {
    expect(parseVendorColumnPicks(['v:Vendor Yang Sudah Tidak Ada'])).toEqual([
      { kind: 'vendor', name: 'Vendor Yang Sudah Tidak Ada' },
    ])
  })

  it('rejects more than the maximum number of columns', () => {
    const many = Array.from({ length: MAX_VENDOR_COLUMNS + 1 }, (_, i) => `v:Vendor ${i}`)
    expect(() => parseVendorColumnPicks(many)).toThrow(BadRequestException)
    expect(MAX_VENDOR_COLUMNS).toBe(12)
  })

  it('counts the cap after deduping, so repeats do not spend the budget', () => {
    const twelve = Array.from({ length: MAX_VENDOR_COLUMNS }, (_, i) => `v:Vendor ${i}`)
    expect(parseVendorColumnPicks([...twelve, 'v:Vendor 0'])).toHaveLength(MAX_VENDOR_COLUMNS)
  })
})

describe('parseVendorNames', () => {
  it('accepts a single occurrence as a bare string', () => {
    expect(parseVendorNames('ESP')).toEqual(['ESP'])
  })

  it('dedupes while keeping order, and drops empty values', () => {
    expect(parseVendorNames(['ESP', '', 'Angkasa', 'ESP'])).toEqual(['ESP', 'Angkasa'])
  })

  it('returns nothing for an absent param', () => {
    expect(parseVendorNames(undefined)).toEqual([])
  })
})
