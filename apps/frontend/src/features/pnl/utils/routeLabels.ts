/**
 * The two route label forms the P&L UI uses, kept apart on purpose.
 *
 * The matrix headers, the Route Group picker and the overlap warnings label an origin by airport
 * code (CGK, SUB), mirroring the spreadsheet those reports replace. The route dropdown instead
 * names both stations exactly as the data stores them, so what the user ticks reads the same as
 * what the source sheet says. Collapsing these into one form would make one of the two lie.
 */

export interface PnlRoutePair {
  origin: string
  dest: string
}

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
export function buildRouteLabelIndex(pairs: { origin: string; dest: string }[]): RouteLabelIndex {
  const byLabel = new Map<string, PnlRoutePair>()
  const labels: string[] = []
  for (const pair of pairs) {
    const label = dropdownRouteLabel(pair)
    if (byLabel.has(label)) continue
    byLabel.set(label, { origin: pair.origin, dest: pair.dest })
    labels.push(label)
  }
  return { labels, byLabel }
}

export function routesForLabels(labels: string[], index: RouteLabelIndex): PnlRoutePair[] {
  return labels.flatMap((label) => {
    const pair = index.byLabel.get(label)
    return pair ? [pair] : []
  })
}

// The inverse. A pair the station list does not know is still labelled rather than dropped: losing
// it would silently widen the filter, which reads as a real (wider) answer instead of a mistake.
export function labelsForRoutes(pairs: PnlRoutePair[]): string[] {
  return pairs.map(dropdownRouteLabel)
}
