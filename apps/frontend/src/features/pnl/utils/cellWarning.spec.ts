import { CellWarning, hasWarning, warningTooltip } from './cellWarning'

const clean: CellWarning = { issues: [], incompleteTos: 0 }

describe('hasWarning', () => {
  it('is false for a clean cell and for a cell with no warning data at all', () => {
    expect(hasWarning(clean)).toBe(false)
    expect(hasWarning(undefined)).toBe(false)
  })

  it('is true when either half is non-empty', () => {
    expect(hasWarning({ issues: [{ issue: 'no_booking', awbs: 1 }], incompleteTos: 0 })).toBe(true)
    expect(hasWarning({ issues: [], incompleteTos: 3 })).toBe(true)
  })
})

describe('warningTooltip', () => {
  it('says nothing for a clean cell, so no tooltip is attached', () => {
    expect(warningTooltip(clean)).toBeUndefined()
    expect(warningTooltip(undefined)).toBeUndefined()
  })

  it('names each issue with its own AWB count, most severe first', () => {
    // Counts stay per issue rather than summed: one AWB can carry two issues, and a total would
    // claim more broken AWBs than there are.
    const tooltip = warningTooltip({
      issues: [
        { issue: 'revenue_missing', awbs: 1 },
        { issue: 'smu_rate_missing', awbs: 2 },
      ],
      incompleteTos: 0,
    })
    expect(tooltip).toBe(
      'Data quality: SMU rate missing for route (2 AWB), Revenue missing (1 AWB)',
    )
  })

  it('adds the incomplete-cost half after a separator', () => {
    const tooltip = warningTooltip({
      issues: [{ issue: 'no_booking', awbs: 1 }],
      incompleteTos: 4,
    })
    expect(tooltip).toBe(
      'Data quality: No booking and no route fallback (DC pair missing in air_shipments_data) (1 AWB) · 4 TO belum ada cost',
    )
  })

  it('reports incomplete cost on its own when there is no classified issue', () => {
    expect(warningTooltip({ issues: [], incompleteTos: 2 })).toBe('2 TO belum ada cost')
  })

  it('falls back to the raw name for an issue the label map has not caught up with', () => {
    expect(warningTooltip({ issues: [{ issue: 'brand_new', awbs: 1 }], incompleteTos: 0 })).toBe(
      'Data quality: brand_new (1 AWB)',
    )
  })
})
