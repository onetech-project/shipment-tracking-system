import { CellWarning, hasWarning, revenueWarning, warningTooltip } from './cellWarning'

const clean: CellWarning = { issues: [], incompleteTos: 0, revenueMissingTos: 0 }

describe('hasWarning', () => {
  it('is false for a clean cell and for a cell with no warning data at all', () => {
    expect(hasWarning(clean)).toBe(false)
    expect(hasWarning(undefined)).toBe(false)
  })

  it('is true when either half is non-empty', () => {
    expect(
      hasWarning({ issues: [{ issue: 'no_booking', awbs: 1 }], incompleteTos: 0, revenueMissingTos: 0 }),
    ).toBe(true)
    expect(hasWarning({ issues: [], incompleteTos: 3, revenueMissingTos: 0 })).toBe(true)
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
      revenueMissingTos: 0,
    })
    expect(tooltip).toBe(
      'Data quality: SMU rate missing for route (2 AWB), Revenue missing (1 AWB)',
    )
  })

  it('adds the incomplete-cost half after a separator', () => {
    const tooltip = warningTooltip({
      issues: [{ issue: 'no_booking', awbs: 1 }],
      incompleteTos: 4,
      revenueMissingTos: 0,
    })
    expect(tooltip).toBe(
      'Data quality: No booking and no route fallback (DC pair missing in air_shipments_data) (1 AWB) · 4 TO belum ada cost',
    )
  })

  it('reports incomplete cost on its own when there is no classified issue', () => {
    expect(warningTooltip({ issues: [], incompleteTos: 2, revenueMissingTos: 0 })).toBe(
      '2 TO belum ada cost',
    )
  })

  it('falls back to the raw name for an issue the label map has not caught up with', () => {
    expect(
      warningTooltip({ issues: [{ issue: 'brand_new', awbs: 1 }], incompleteTos: 0, revenueMissingTos: 0 }),
    ).toBe('Data quality: brand_new (1 AWB)')
  })
})

describe('revenueWarning', () => {
  it('keeps a revenue issue', () => {
    expect(
      revenueWarning({
        issues: [{ issue: 'revenue_missing', awbs: 2 }],
        incompleteTos: 0,
        revenueMissingTos: 0,
      }),
    ).toEqual({
      issues: [{ issue: 'revenue_missing', awbs: 2 }],
      incompleteTos: 0,
      revenueMissingTos: 0,
    })
  })

  it('drops cost issues, so a cost-only cell reads as clean', () => {
    const costOnly = revenueWarning({
      issues: [
        { issue: 'smu_rate_missing', awbs: 3 },
        { issue: 'sg_in_rate_missing', awbs: 1 },
      ],
      incompleteTos: 4,
      revenueMissingTos: 0,
    })
    expect(hasWarning(costOnly)).toBe(false)
  })

  it('drops incompleteTos, which counts TOs with no cost and never touches revenue', () => {
    expect(
      hasWarning(revenueWarning({ issues: [], incompleteTos: 9, revenueMissingTos: 0 })),
    ).toBe(false)
  })

  it('still warns when a cell has a revenue issue AND cost problems', () => {
    // "Only revenue" means only revenue DECIDES the colour — a cost problem neither adds to it nor
    // cancels it. Blanking a mixed cell would hide missing revenue exactly where data is worst.
    const mixed = revenueWarning({
      issues: [
        { issue: 'no_booking', awbs: 5 },
        { issue: 'revenue_missing', awbs: 1 },
      ],
      incompleteTos: 7,
      revenueMissingTos: 0,
    })
    expect(hasWarning(mixed)).toBe(true)
    expect(warningTooltip(mixed)).toBe('Data quality: Revenue missing (1 AWB)')
  })

  it('passes undefined through rather than inventing a clean warning', () => {
    expect(revenueWarning(undefined)).toBeUndefined()
  })
})

describe('revenueMissingTos', () => {
  it('warns on its own, with no issue and no incomplete cost', () => {
    expect(hasWarning({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })).toBe(true)
  })

  it('says how many TOs have no revenue', () => {
    expect(warningTooltip({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })).toBe(
      '2 TO tanpa revenue',
    )
  })

  it('names the revenue half before the cost half', () => {
    // Revenue first: it says the number itself is missing, which outranks "this number is
    // understated by a cost we could not compute".
    expect(
      warningTooltip({ issues: [], incompleteTos: 3, revenueMissingTos: 2 }),
    ).toBe('2 TO tanpa revenue · 3 TO belum ada cost')
  })

  it('survives revenueWarning, which is the whole point', () => {
    // This is what makes a Revenue cell yellow. incompleteTos is forced to zero because a missing
    // cost cannot move SUM(revenue_total); revenueMissingTos can, by dropping out of that sum.
    expect(
      revenueWarning({
        issues: [{ issue: 'no_booking', awbs: 1 }],
        incompleteTos: 5,
        revenueMissingTos: 2,
      }),
    ).toEqual({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })
  })

  it('leaves a cell with only cost problems clean on the Revenue table', () => {
    expect(
      hasWarning(
        revenueWarning({
          issues: [{ issue: 'smu_rate_missing', awbs: 1 }],
          incompleteTos: 4,
          revenueMissingTos: 0,
        }),
      ),
    ).toBe(false)
  })
})
