import { issueLabel, issueRank } from './issueLabels'
import { PnlCellIssue } from '../hooks/usePnl'

/**
 * What makes a P&L cell yellow, and what the tooltip says about it. One definition for the daily
 * matrix and the route comparison, so "yellow" cannot come to mean two different things.
 */
export interface CellWarning {
  issues: PnlCellIssue[] // the cause: classified data quality problems, per issue type
  incompleteTos: number // the effect on cost: TOs with no cost at all
  // The effect on revenue: TOs whose revenue_total is NULL. Separate from `issues` because
  // v_pnl_to.issue is a priority chain that ranks cost causes above 'revenue_missing', so a TO
  // that is both uncosted and revenue-less never carries the revenue label. This count is a
  // direct aggregate and cannot be outranked.
  revenueMissingTos: number
}

// The amber tint every warned cell shares, across both the daily matrix and the route comparison
// tables — one definition so the two tables cannot drift into two different "warned" colors.
export const WARNING_TINT = 'bg-amber-100 dark:bg-amber-950/40'

export function hasWarning(warning: CellWarning | undefined): warning is CellWarning {
  if (!warning) return false
  return warning.issues.length > 0 || warning.incompleteTos > 0 || warning.revenueMissingTos > 0
}

export function warningTooltip(warning: CellWarning | undefined): string | undefined {
  if (!hasWarning(warning)) return undefined
  const parts: string[] = []
  if (warning.issues.length > 0) {
    // Per-issue counts, never a total: an AWB can carry two issues, so summing would overstate how
    // many AWBs are actually broken.
    const named = [...warning.issues]
      .sort((a, b) => issueRank(a.issue) - issueRank(b.issue) || a.issue.localeCompare(b.issue))
      .map((i) => `${issueLabel(i.issue)} (${i.awbs} AWB)`)
      .join(', ')
    parts.push(`Data quality: ${named}`)
  }
  if (warning.revenueMissingTos > 0) {
    parts.push(`${warning.revenueMissingTos} TO tanpa revenue`)
  }
  if (warning.incompleteTos > 0) {
    parts.push(`${warning.incompleteTos} TO belum ada cost`)
  }
  return parts.join(' · ')
}

// The only issue values that say revenue itself is missing. Named rather than inlined so there is
// one place to extend if another revenue-side issue is ever classified.
//
// The chain caveat that used to live here is answered by CellWarning.revenueMissingTos, which is
// a direct COUNT(*) FILTER (WHERE revenue_total IS NULL) rather than a read of the chain.
const REVENUE_ISSUES = new Set(['revenue_missing'])

/**
 * The same warning, narrowed to what makes the REVENUE number unreliable. Cost issues and
 * incompleteTos are dropped: neither can move SUM(revenue_total). Used by the revenue table only —
 * margin is revenue − discount − cost, so both halves still spoil it.
 */
// Overloaded so callers holding a definite warning — every cell and footer entry does, since both
// are built with a clean fallback — get one back without a non-null assertion.
export function revenueWarning(warning: CellWarning): CellWarning
export function revenueWarning(warning: CellWarning | undefined): CellWarning | undefined
export function revenueWarning(warning: CellWarning | undefined): CellWarning | undefined {
  if (!warning) return undefined
  return {
    issues: warning.issues.filter((i) => REVENUE_ISSUES.has(i.issue)),
    incompleteTos: 0,
    // Kept, unlike incompleteTos: a NULL revenue_total drops straight out of SUM(revenue_total),
    // so this is exactly the signal that the revenue number on screen is understated.
    revenueMissingTos: warning.revenueMissingTos,
  }
}
