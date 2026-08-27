import { FROZEN_CELL, FROZEN_CELL_STRIPED, FROZEN_CELL_SUBTLE, frozenCell } from './frozenColumn'

const ALL = [FROZEN_CELL, FROZEN_CELL_STRIPED, FROZEN_CELL_SUBTLE]

describe('frozen column backgrounds', () => {
  // The bug this module exists to prevent: a sticky <td> whose only background is a translucent
  // tint lets the columns scrolling underneath show through it.
  it('always paints an opaque base', () => {
    for (const className of ALL) {
      expect(className.split(' ')).toContain('bg-card')
    }
  })

  it('never applies a translucent tint to the cell itself, only through ::before', () => {
    for (const className of ALL) {
      const own = className.split(' ').filter((c) => !c.startsWith('before:'))
      expect(own.filter((c) => c.includes('/'))).toEqual([])
    }
  })

  it('gives every tint layer the box, the stacking position and the content it needs to render', () => {
    // An ::before with no content property does not generate a box at all, and without inset-0 it
    // would collapse to nothing. -z-10 keeps it above the cell's own background but below its text.
    for (const className of [FROZEN_CELL_STRIPED, FROZEN_CELL_SUBTLE]) {
      const parts = className.split(' ')
      expect(parts).toContain('before:absolute')
      expect(parts).toContain('before:inset-0')
      expect(parts).toContain('before:-z-10')
      expect(parts).toContain("before:content-['']")
    }
  })

  it('matches the stripe state of the row it sits in', () => {
    expect(frozenCell(true)).toBe(FROZEN_CELL_STRIPED)
    expect(frozenCell(false)).toBe(FROZEN_CELL)
  })
})
