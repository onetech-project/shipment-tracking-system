import { indexIssueRows, issueRank, sortIssues } from './pnl-cell-issues.util'

describe('issueRank', () => {
  it('ranks the root cause ahead of the symptom it produces', () => {
    // A blank station is what breaks the SG Incoming join, so it must sort first.
    expect(issueRank('station_mapping_missing')).toBeLessThan(issueRank('sg_in_rate_missing'))
  })

  it('sinks an unknown issue below every known one', () => {
    expect(issueRank('something_new')).toBeGreaterThan(issueRank('sg_in_rate_missing'))
  })
})

describe('sortIssues', () => {
  it('orders by severity, not by count or arrival order', () => {
    const sorted = sortIssues([
      { issue: 'sg_in_rate_missing', awbs: 9 },
      { issue: 'no_booking', awbs: 1 },
      { issue: 'ra_rate_missing', awbs: 4 },
    ])
    expect(sorted.map((i) => i.issue)).toEqual([
      'no_booking',
      'ra_rate_missing',
      'sg_in_rate_missing',
    ])
  })

  it('breaks a tie between two unknown issues by name so the order is stable', () => {
    const sorted = sortIssues([
      { issue: 'zeta_thing', awbs: 1 },
      { issue: 'alpha_thing', awbs: 1 },
    ])
    expect(sorted.map((i) => i.issue)).toEqual(['alpha_thing', 'zeta_thing'])
  })

  it('does not mutate the input array', () => {
    const input = [
      { issue: 'sg_in_rate_missing', awbs: 1 },
      { issue: 'no_booking', awbs: 1 },
    ]
    sortIssues(input)
    expect(input[0].issue).toBe('sg_in_rate_missing')
  })
})

describe('indexIssueRows', () => {
  const rows = [
    { k: 'a', issue: 'sg_in_rate_missing', awbs: '2' },
    { k: 'a', issue: 'no_booking', awbs: '1' },
    { k: 'b', issue: 'no_booking', awbs: '5' },
  ]

  it('groups rows by key with counts coerced from the driver strings', () => {
    const index = indexIssueRows(rows, (r) => r.k as string)
    expect(index.get('a')).toEqual([
      { issue: 'no_booking', awbs: 1 },
      { issue: 'sg_in_rate_missing', awbs: 2 },
    ])
    expect(index.get('b')).toEqual([{ issue: 'no_booking', awbs: 5 }])
  })

  it('drops a row whose key resolves to null rather than bucketing it under a fake key', () => {
    // The footer rows of a GROUPING SETS query carry a NULL date; callers key those separately,
    // and a row that belongs to neither bucket must vanish instead of corrupting one.
    const index = indexIssueRows(rows, (r) => (r.k === 'b' ? null : (r.k as string)))
    expect(index.has('b')).toBe(false)
    expect(index.get('a')).toHaveLength(2)
  })
})
