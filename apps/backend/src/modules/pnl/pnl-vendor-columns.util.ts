import { BadRequestException } from '@nestjs/common'

/**
 * Parsing for the two repeated query params on the vendor side of P&L: `columns` on the vendor
 * comparison and `vendor` on the AWB drilldown.
 *
 * Repeated, not delimited. Station codes are guaranteed free of ',' and '|' (see
 * pnl-columns.util.ts), which is what lets the route params use a flat delimited encoding. Vendor
 * names are not: they are free text typed into a Google Sheet and may contain any punctuation.
 *
 * Express 4's default `qs` parser gives a **string** when a param appears once and an **array**
 * when it appears twice or more, so every entry point here normalises before iterating. Without
 * that, the single-column case — the first thing any user does — iterates a string one character
 * at a time.
 */

export type VendorColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'vendor'; name: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The table grows by three columns per pick and only the first column is sticky-left, so this is
// a readability limit as much as a cost one.
export const MAX_VENDOR_COLUMNS = 12

function toArray(raw?: string | string[]): string[] {
  return Array.isArray(raw) ? raw : raw == null ? [] : [raw]
}

export function parseVendorColumnPicks(raw?: string | string[]): VendorColumnPick[] {
  const seen = new Set<string>()
  const picks: VendorColumnPick[] = []

  for (const value of toArray(raw)) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Invalid column descriptor: ${String(value)}`)
    }
    // First colon only. A vendor named 'Vendor: Utama' is a real possibility, and splitting on
    // every colon would truncate it to 'Vendor' and silently join against nothing.
    const colon = value.indexOf(':')
    if (colon === -1) throw new BadRequestException(`Invalid column descriptor: ${value}`)
    const prefix = value.slice(0, colon)
    const rest = value.slice(colon + 1)

    let pick: VendorColumnPick
    if (prefix === 'vg') {
      if (!UUID_RE.test(rest)) throw new BadRequestException(`Invalid vendor group id: ${rest}`)
      pick = { kind: 'group', id: rest }
    } else if (prefix === 'v') {
      // Raw and untrimmed on purpose: the name has to stay byte-identical to v_pnl_to.vendor or
      // the join misses without saying so. Only a completely empty name is refused.
      if (rest === '') throw new BadRequestException(`Invalid vendor descriptor: ${value}`)
      pick = { kind: 'vendor', name: rest }
    } else {
      throw new BadRequestException(`Invalid column descriptor: ${value}`)
    }

    const key = pick.kind === 'group' ? `vg:${pick.id}` : `v:${pick.name}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(pick)
  }

  // Checked after deduping: a client that repeats a pick has not actually asked for more columns.
  if (picks.length > MAX_VENDOR_COLUMNS) {
    throw new BadRequestException(
      `Too many comparison columns: ${picks.length} (max ${MAX_VENDOR_COLUMNS})`,
    )
  }
  return picks
}

// The drilldown's vendor filter. A group column carries many vendors, so this param repeats too.
// Unknown names are passed through: they simply match no rows, which is the honest answer.
export function parseVendorNames(raw?: string | string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const value of toArray(raw)) {
    if (typeof value !== 'string' || value === '') continue
    if (seen.has(value)) continue
    seen.add(value)
    names.push(value)
  }
  return names
}
