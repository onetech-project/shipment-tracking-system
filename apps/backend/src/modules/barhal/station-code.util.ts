/**
 * Maps the full station/city names stored in air_shipments_compileaircgk.origin_station /
 * dest_station to short airport codes, so Barhal can build route labels ("CGK - SUB") and
 * Koli numbers ("20Jul-CGK-SUB-Barhal1") consistent with the SLA Monitoring feature's format.
 *
 * air_shipments_compileaircgk stores full city names (not codes) — there is no existing
 * mapping table in the codebase. This list should be reconciled against the live
 * `SELECT DISTINCT origin_station, dest_station FROM air_shipments_compileaircgk` values
 * before go-live; unmapped names fall back to a derived code rather than failing.
 */
export const STATION_CODE_MAP: Record<string, string> = {
  jakarta: 'CGK',
  surabaya: 'SUB',
  denpasar: 'DPS',
  bali: 'DPS',
  medan: 'KNO',
  makassar: 'UPG',
  balikpapan: 'BPN',
  semarang: 'SRG',
  yogyakarta: 'JOG',
  palembang: 'PLM',
  batam: 'BTH',
  pekanbaru: 'PKU',
  banjarmasin: 'BDJ',
  manado: 'MDC',
  lombok: 'LOP',
  padang: 'PDG',
  solo: 'SOC',
  pontianak: 'PNK',
}

/** Derives a short station code from a full station/city name, with a logged fallback. */
export function deriveStationCode(stationName: string | null | undefined): string {
  const trimmed = (stationName ?? '').trim()
  if (!trimmed) return ''
  const mapped = STATION_CODE_MAP[trimmed.toLowerCase()]
  if (mapped) return mapped
  // eslint-disable-next-line no-console
  console.warn(`[barhal] no station code mapping for "${trimmed}" — falling back to derived code`)
  return trimmed.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
}

/** Builds the "CGK - SUB" route label from two full station names. */
export function buildRouteLabel(originStation: string | null | undefined, destStation: string | null | undefined): string {
  const origin = deriveStationCode(originStation)
  const dest = deriveStationCode(destStation)
  return origin && dest ? `${origin} - ${dest}` : ''
}
