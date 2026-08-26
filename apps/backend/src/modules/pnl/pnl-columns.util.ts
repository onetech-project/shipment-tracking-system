import { BadRequestException } from '@nestjs/common'

/**
 * Parsing for the two P&L query params that carry a list: `routes` on the AWB drilldown and
 * `columns` on the group comparison. Both reject malformed input loudly — a silently dropped
 * route reads to the user as "nothing flew here", which is indistinguishable from a real answer.
 */

export interface RoutePair {
  origin: string
  dest: string
}

// One comparison column: either a saved route group, or a single ad-hoc route the user picked.
export type ColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'route'; origin: string; dest: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Station names contain spaces ('Tanjung Pinang') but never '|' or ',', which is what makes this
// flat encoding safe without escaping.
function parsePair(raw: string): RoutePair {
  const parts = raw.split('|')
  const [origin, dest] = parts.map((p) => p.trim())
  if (parts.length !== 2 || !origin || !dest) {
    throw new BadRequestException(`Invalid route pair: ${raw}`)
  }
  return { origin, dest }
}

function splitList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseRoutePairs(raw?: string): RoutePair[] {
  const seen = new Set<string>()
  const pairs: RoutePair[] = []
  for (const item of splitList(raw)) {
    const pair = parsePair(item)
    const key = `${pair.origin}|${pair.dest}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(pair)
  }
  return pairs
}

export function parseColumnPicks(raw?: string): ColumnPick[] {
  const seen = new Set<string>()
  const picks: ColumnPick[] = []
  for (const item of splitList(raw)) {
    let pick: ColumnPick
    if (item.startsWith('g:')) {
      const id = item.slice(2)
      if (!UUID_RE.test(id)) throw new BadRequestException(`Invalid group id: ${id}`)
      pick = { kind: 'group', id }
    } else if (item.startsWith('r:')) {
      pick = { kind: 'route', ...parsePair(item.slice(2)) }
    } else {
      throw new BadRequestException(`Invalid column descriptor: ${item}`)
    }
    const key = pick.kind === 'group' ? `g:${pick.id}` : `r:${pick.origin}|${pick.dest}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(pick)
  }
  return picks
}
