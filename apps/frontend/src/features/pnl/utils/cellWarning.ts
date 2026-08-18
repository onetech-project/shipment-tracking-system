import { issueLabel, issueRank } from './issueLabels'
import { PnlCellIssue } from '../hooks/usePnl'

/**
 * What makes a P&L cell yellow, and what the tooltip says about it. One definition for the daily
 * matrix and the group comparison, so "yellow" cannot come to mean two different things.
 */
export interface CellWarning {
  issues: PnlCellIssue[] // the cause: classified data quality problems, per issue type
  incompleteTos: number // the effect: TOs with no cost at all
}

export function hasWarning(warning: CellWarning | undefined): boolean {
  if (!warning) return false
  return warning.issues.length > 0 || warning.incompleteTos > 0
}

export function warningTooltip(warning: CellWarning | undefined): string | undefined {
  if (!hasWarning(warning)) return undefined
  const parts: string[] = []
  if (warning!.issues.length > 0) {
    // Per-issue counts, never a total: an AWB can carry two issues, so summing would overstate how
    // many AWBs are actually broken.
    const named = [...warning!.issues]
      .sort((a, b) => issueRank(a.issue) - issueRank(b.issue) || a.issue.localeCompare(b.issue))
      .map((i) => `${issueLabel(i.issue)} (${i.awbs} AWB)`)
      .join(', ')
    parts.push(`Data quality: ${named}`)
  }
  if (warning!.incompleteTos > 0) {
    parts.push(`${warning!.incompleteTos} TO belum ada cost`)
  }
  return parts.join(' · ')
}
