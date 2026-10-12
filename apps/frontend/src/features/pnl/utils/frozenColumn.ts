/**
 * Backgrounds for the frozen (sticky) first column of the P&L tables. One definition so "frozen"
 * looks the same in the Daily Report, the Route Comparison and the Vendor Comparison.
 *
 * The rule: a frozen cell's own background must be OPAQUE. A sticky <td> does not carry its row's
 * background with it, so a translucent tint like `bg-surface-2/60` — which is what these cells
 * used to set directly — lets the columns scrolling underneath show straight through the frozen one.
 *
 * The stripe is therefore painted as a layer on top of an opaque `bg-card` rather than swapped in
 * as a solid colour: solid `bg-surface-2` composited at full opacity over `bg-card` reproduces the
 * same tint a translucent overlay would, without letting the frozen column show through against
 * the rest of the table. `before:-z-10` keeps that layer above the cell's own background but below its
 * text — the cell is already `sticky z-10`, so the pseudo-element is positioned against it and
 * contained by its stacking context.
 *
 * Written out as whole literal strings, never interpolated: Tailwind scans source text for class
 * names, and a composed `before:${tint}` would never be emitted.
 */

// An unstriped row.
export const FROZEN_CELL = 'bg-card'

// A striped body row (matches `bg-surface-2`).
export const FROZEN_CELL_STRIPED =
  "bg-card before:absolute before:inset-0 before:-z-10 before:bg-surface-2 before:content-['']"

// An unstriped cost-detail row, which tints itself `bg-surface-2/60` to sit under its parent row.
export const FROZEN_CELL_SUBTLE =
  "bg-card before:absolute before:inset-0 before:-z-10 before:bg-surface-2/60 before:content-['']"

// The frozen cell background matching a body row's stripe state.
export function frozenCell(striped: boolean): string {
  return striped ? FROZEN_CELL_STRIPED : FROZEN_CELL
}
