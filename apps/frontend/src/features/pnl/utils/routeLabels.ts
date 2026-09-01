/**
 * The two route label forms the P&L UI uses, kept apart on purpose.
 *
 * The matrix headers, the Route Group picker and the overlap warnings label an origin by airport
 * code (CGK, SUB), mirroring the spreadsheet those reports replace. The route dropdown instead
 * names both stations exactly as the data stores them, so what the user ticks reads the same as
 * what the source sheet says. Collapsing these into one form would make one of the two lie.
 */

import { PnlRoutePair } from '../hooks/usePnl'

const SEPARATOR = ' → '

export function dropdownRouteLabel(pair: { origin: string; dest: string }): string {
  return `${pair.origin}${SEPARATOR}${pair.dest}`
}

export function displayRouteLabel(route: { originLabel: string; dest: string }): string {
  return `${route.originLabel}${SEPARATOR}${route.dest}`
}

export interface RouteLabelIndex {
  labels: string[]
  byLabel: Map<string, PnlRoutePair>
}

// MultiRouteFilter speaks in label strings. This is the only place that translates them back, so
// no consumer has to parse a label and guess where a station name with a space in it splits.
//
// `label` picks which of the two forms above the dropdown shows. It defaults to the raw one the
// Route Comparison picker uses; the Daily Report's filter passes displayRouteLabel instead, because
// it sits beside a matrix whose headers name origins by airport code. Either way the map holds the
// RAW pair, so what comes back out is what the data is filtered on.
export function buildRouteLabelIndex(
  pairs: { origin: string; originLabel?: string; dest: string }[],
  label: (pair: { origin: string; originLabel: string; dest: string }) => string = dropdownRouteLabel,
): RouteLabelIndex {
  const byLabel = new Map<string, PnlRoutePair>()
  const labels: string[] = []
  for (const pair of pairs) {
    const text = label({ ...pair, originLabel: pair.originLabel ?? pair.origin })
    if (byLabel.has(text)) continue
    byLabel.set(text, { origin: pair.origin, dest: pair.dest })
    labels.push(text)
  }
  return { labels, byLabel }
}

export function routesForLabels(labels: string[], index: RouteLabelIndex): PnlRoutePair[] {
  return labels.flatMap((label) => {
    const pair = index.byLabel.get(label)
    return pair ? [pair] : []
  })
}

// The inverse. Given the index the dropdown was built from, a pair is ticked with the same label
// that index listed it under; without one, the raw form is used.
//
// A pair the index does not know is still labelled rather than dropped: losing it would silently
// widen the filter, which reads as a real (wider) answer instead of a mistake.
export function labelsForRoutes(pairs: PnlRoutePair[], index?: RouteLabelIndex): string[] {
  if (!index) return pairs.map(dropdownRouteLabel)
  const byPair = new Map([...index.byLabel].map(([label, pair]) => [`${pair.origin}|${pair.dest}`, label]))
  return pairs.map((pair) => byPair.get(`${pair.origin}|${pair.dest}`) ?? dropdownRouteLabel(pair))
}
