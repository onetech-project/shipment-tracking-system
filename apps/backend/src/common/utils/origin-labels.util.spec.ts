import { originLabel, ORIGIN_LABELS } from './origin-labels.util'

describe('originLabel', () => {
  it('maps the known raw station values to airport codes', () => {
    expect(originLabel('Jabo')).toBe('CGK')
    expect(originLabel('Surabaya')).toBe('SUB')
  })

  // A newly opened station should be visible rather than silently blank.
  it('falls back to the raw value for an unmapped origin', () => {
    expect(originLabel('Medan')).toBe('Medan')
  })

  it('exposes the map itself for callers that need to enumerate it', () => {
    expect(ORIGIN_LABELS).toEqual({ Jabo: 'CGK', Surabaya: 'SUB' })
  })
})
