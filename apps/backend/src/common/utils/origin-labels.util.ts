/**
 * Display labels for raw v_pnl_to origin_station values. Lives in common/ rather than inside the
 * PnL module because the route-groups module needs the same mapping for its route picker, and
 * neither module should have to import the other for a two-entry constant.
 *
 * The spreadsheet these reports mirror labels origins by airport code. Unknown origins fall back
 * to their raw value so a newly opened station is visible rather than silently blank.
 */
export const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Surabaya: 'SUB',
}

export function originLabel(origin: string): string {
  return ORIGIN_LABELS[origin] ?? origin
}
