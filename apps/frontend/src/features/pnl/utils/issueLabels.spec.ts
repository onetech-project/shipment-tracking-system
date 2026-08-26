import { issueLabel, issueRank } from './issueLabels'

describe('issueLabel', () => {
  it('names the station mapping gap in terms of the fix it needs', () => {
    // The whole point of this issue is telling someone WHICH table to complete, so the label has
    // to name it. A bare "Station missing" would send them back to the Compile sheet instead.
    expect(issueLabel('station_mapping_missing')).toBe(
      'Station mapping missing (DC pair not in air_shipments_data)',
    )
  })

  it('falls back to the raw value for an unknown issue', () => {
    expect(issueLabel('something_new')).toBe('something_new')
  })

  it('renders an em-dash when there is no issue', () => {
    expect(issueLabel(null)).toBe('—')
  })
})

describe('issueRank', () => {
  it('ranks the station gap ahead of the SG In rate miss it causes', () => {
    expect(issueRank('station_mapping_missing')).toBeLessThan(issueRank('sg_in_rate_missing'))
  })

  it('sinks an unknown issue below every known one', () => {
    expect(issueRank('something_new')).toBeGreaterThan(issueRank('sg_in_rate_missing'))
  })
})
