import { SEVERITY_FILTER_OPTIONS, expiryText, severityMeta } from './severity'
import { FLEET_SEVERITIES } from '../types'

describe('severityMeta', () => {
  // Every severity the backend can emit must map to something renderable. A missing entry
  // renders `undefined` into a className and the badge loses its colour silently.
  it.each(FLEET_SEVERITIES)('maps %s to a label and a tone', (severity) => {
    const meta = severityMeta(severity)
    expect(meta.label).toBeTruthy()
    expect(meta.tone).toBeTruthy()
  })

  it('labels crit as expired', () => {
    expect(severityMeta('crit').label).toBe('Kadaluarsa')
  })

  it('labels warn as approaching', () => {
    expect(severityMeta('warn').label).toBe('Segera')
  })

  it('labels ok as valid', () => {
    expect(severityMeta('ok').label).toBe('Aktif')
  })

  // 'none' means no dated document at all, which is different from a valid one and must not be
  // dressed up in green.
  it('distinguishes none from ok', () => {
    expect(severityMeta('none').label).not.toBe(severityMeta('ok').label)
    expect(severityMeta('none').tone).not.toBe(severityMeta('ok').tone)
  })

  it('gives crit, warn and ok three distinct tones', () => {
    const tones = new Set(['crit', 'warn', 'ok'].map((s) => severityMeta(s as never).tone))
    expect(tones.size).toBe(3)
  })

  // The dot is the only severity cue on a narrow viewport, where the badge label is clipped.
  // A dot that renders `undefined` into a className disappears entirely rather than degrading.
  it.each(FLEET_SEVERITIES)('maps %s to a dot colour', (severity) => {
    expect(severityMeta(severity).dot).toBeTruthy()
  })

  it.each([
    ['crit', 'bg-red-500'],
    ['warn', 'bg-amber-500'],
    ['ok', 'bg-emerald-500'],
    ['none', 'bg-slate-400'],
  ])('paints the %s dot %s', (severity, dot) => {
    expect(severityMeta(severity as never).dot).toBe(dot)
  })

  // The same "grey, not green" rule the tone obeys. Pinned separately because the dot is a
  // second, independent colour channel: a green dot on a vehicle we hold no papers for claims
  // the papers are in order.
  it('keeps the none dot distinct from the ok dot', () => {
    expect(severityMeta('none').dot).not.toBe(severityMeta('ok').dot)
  })

  it('gives crit, warn and ok three distinct dots', () => {
    const dots = new Set(['crit', 'warn', 'ok'].map((s) => severityMeta(s as never).dot))
    expect(dots.size).toBe(3)
  })

  // Runtime armour, not a reachable branch: the FleetVehicle wire type is looser than the
  // FleetSeverity union, so a backend that invents a severity would otherwise render
  // `undefined` into every className. Reached here only through a deliberate type escape.
  it('falls back to the none meta for a severity outside the union', () => {
    expect(severityMeta('tidak-diketahui' as never)).toEqual(severityMeta('none'))
  })
})

describe('expiryText', () => {
  it('reads out the remaining days', () => {
    expect(expiryText(12)).toBe('12 hari lagi')
  })

  // Today is the last valid day, not an expired one — an operator seeing "0 hari lagi" would
  // reasonably think there is still time.
  it('calls zero days today', () => {
    expect(expiryText(0)).toBe('Hari ini')
  })

  it('reports how long ago a document lapsed', () => {
    expect(expiryText(-3)).toBe('Lewat 3 hari')
  })

  it('says a document has no date rather than rendering null', () => {
    expect(expiryText(null)).toBe('Belum ada tanggal')
  })
})

describe('SEVERITY_FILTER_OPTIONS', () => {
  // The filter dropdown offers every severity plus an all-clear entry. Anything missing here is
  // a filter an operator cannot reach.
  it('offers every severity plus an unfiltered option', () => {
    expect(SEVERITY_FILTER_OPTIONS).toHaveLength(FLEET_SEVERITIES.length + 1)
  })

  it('uses an empty value for the unfiltered option', () => {
    expect(SEVERITY_FILTER_OPTIONS[0].value).toBe('')
  })

  it('covers every severity value', () => {
    const values = SEVERITY_FILTER_OPTIONS.map((o) => o.value)
    FLEET_SEVERITIES.forEach((s) => expect(values).toContain(s))
  })
})
