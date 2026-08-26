import {
  buildRouteLabelIndex,
  displayRouteLabel,
  dropdownRouteLabel,
  labelsForRoutes,
} from './routeLabels'

describe('dropdownRouteLabel', () => {
  it('names the stations exactly as the data stores them', () => {
    // The dropdown lists stations as the source sheet writes them; the airport-code form belongs
    // to the matrix header, which mirrors the spreadsheet this report replaces.
    expect(dropdownRouteLabel({ origin: 'Jabo', dest: 'Denpasar' })).toBe('Jabo → Denpasar')
  })
})

describe('displayRouteLabel', () => {
  it('uses the airport-code origin label', () => {
    expect(displayRouteLabel({ originLabel: 'CGK', dest: 'Denpasar' })).toBe('CGK → Denpasar')
  })
})

describe('buildRouteLabelIndex', () => {
  const pairs = [
    { origin: 'Jabo', dest: 'Denpasar' },
    { origin: 'Surabaya', dest: 'Tanjung Pinang' },
  ]

  it('lists every label in the order given', () => {
    expect(buildRouteLabelIndex(pairs).labels).toEqual([
      'Jabo → Denpasar',
      'Surabaya → Tanjung Pinang',
    ])
  })

  it('maps a label back to its pair, including a station name with a space in it', () => {
    const { byLabel } = buildRouteLabelIndex(pairs)
    expect(byLabel.get('Surabaya → Tanjung Pinang')).toEqual({
      origin: 'Surabaya',
      dest: 'Tanjung Pinang',
    })
  })

  it('drops a duplicate pair so the dropdown never lists it twice', () => {
    const { labels } = buildRouteLabelIndex([...pairs, { origin: 'Jabo', dest: 'Denpasar' }])
    expect(labels).toHaveLength(2)
  })
})

describe('labelsForRoutes', () => {
  const index = buildRouteLabelIndex([
    { origin: 'Jabo', dest: 'Denpasar' },
    { origin: 'Jabo', dest: 'Aceh' },
  ])

  it('turns selected pairs back into the labels the dropdown ticks', () => {
    expect(labelsForRoutes([{ origin: 'Jabo', dest: 'Aceh' }])).toEqual(['Jabo → Aceh'])
  })

  it('keeps a pair that is not in the index, so a filter is never silently widened', () => {
    // A cell click can carry a route the station list has not caught up with. Dropping it here
    // would show the user a wider result set than the one they asked for, with no clue why.
    expect(labelsForRoutes([{ origin: 'Jabo', dest: 'Manokwari' }])).toEqual(['Jabo → Manokwari'])
  })
})
