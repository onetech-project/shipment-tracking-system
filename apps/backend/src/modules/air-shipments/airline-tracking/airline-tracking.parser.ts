/**
 * Pure parsing + offload logic for the Cargoflash AWB tracking response
 * (Garuda/Citilink ICMS and Pelita share the same schema).
 *
 * Response shape (relevant parts):
 *   { "Table0": [{ ..., "FlightDate": "03 Jun 2026" }],
 *     "Table3": [{ "Action": "BKD"|"DEP"|..., "FlightNo": "QG-0480", "FlightDate": "04 Jun 2026", ... }] }
 *
 * BKD = booked flight; DEP = actual departure legs (in chronological order).
 */

export interface DepLeg {
  flightNo: string
  flightDate: string
}

export interface ParsedTracking {
  bookedDate: string | null
  bookedFlightNo: string | null
  depLegs: DepLeg[]
  /** Offload when any departure from DEP2 onward has a flight date != the booked date. */
  offload: boolean
}

interface MovementRecord {
  Action?: string
  FlightNo?: string
  FlightDate?: string
  [key: string]: unknown
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase()

/** The endpoint sometimes returns a JSON string rather than a parsed object. */
export function coerceTrackingPayload(data: unknown): Record<string, unknown> | null {
  let value = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Parses a tracking payload into booked + departure legs and computes offload.
 * Rule (confirmed): compare the booked flight date to every departure from DEP2
 * onward; any mismatch → offload. DEP1 (the booked departure) is excluded, so a
 * same-flight delay is not an offload. No departures (or no booked date) → onboard.
 */
export function parseTracking(payload: Record<string, unknown> | null): ParsedTracking {
  const empty: ParsedTracking = {
    bookedDate: null,
    bookedFlightNo: null,
    depLegs: [],
    offload: false,
  }
  if (!payload) return empty

  const table3 = Array.isArray(payload.Table3) ? (payload.Table3 as MovementRecord[]) : []
  const table0 = Array.isArray(payload.Table0) ? (payload.Table0 as MovementRecord[]) : []

  const bkd = table3.find((r) => norm(r.Action) === 'bkd')
  const bookedFlightNo =
    (bkd?.FlightNo && String(bkd.FlightNo).trim()) ||
    (table0[0]?.FlightNo ? String(table0[0].FlightNo).trim() : '') ||
    null
  const bookedDate =
    (bkd?.FlightDate && String(bkd.FlightDate).trim()) ||
    (table0[0]?.FlightDate ? String(table0[0].FlightDate).trim() : '') ||
    null

  const depLegs: DepLeg[] = table3
    .filter((r) => norm(r.Action) === 'dep')
    .map((r) => ({
      flightNo: r.FlightNo ? String(r.FlightNo).trim() : '',
      flightDate: r.FlightDate ? String(r.FlightDate).trim() : '',
    }))

  // DEP2 onward vs booked date. No booked date or <2 departures → onboard.
  const offload =
    !!bookedDate &&
    depLegs.slice(1).some((leg) => leg.flightDate !== '' && norm(leg.flightDate) !== norm(bookedDate))

  return { bookedDate, bookedFlightNo, depLegs, offload }
}

/** Column values for air_shipments_awb_flight_tracking, mirroring the drill-in display. */
export function toTrackingRow(
  awb: string,
  carrierCode: string,
  parsed: ParsedTracking,
): Record<string, string | boolean | null> {
  const leg = (i: number) => parsed.depLegs[i] ?? { flightNo: '', flightDate: '' }
  const orNull = (s: string) => (s && s.trim() ? s : null)
  return {
    awb,
    carrier_code: carrierCode,
    std_booking: parsed.bookedDate,
    std_flight_no: parsed.bookedFlightNo,
    actual_flight_dep: orNull(leg(0).flightDate),
    dep_flight_no: orNull(leg(0).flightNo),
    dep2: orNull(leg(1).flightDate),
    dep2_flight_no: orNull(leg(1).flightNo),
    dep3: orNull(leg(2).flightDate),
    dep3_flight_no: orNull(leg(2).flightNo),
    dep4: orNull(leg(3).flightDate),
    dep4_flight_no: orNull(leg(3).flightNo),
    dep5: orNull(leg(4).flightDate),
    dep5_flight_no: orNull(leg(4).flightNo),
    offload: parsed.offload,
  }
}

/** Splits a full AWB ("778-04070113") into its carrier code and AWB number. */
export function splitAwb(awb: string): { carrierCode: string; awbNo: string } | null {
  const trimmed = String(awb ?? '').trim()
  const idx = trimmed.indexOf('-')
  if (idx <= 0) return null
  const carrierCode = trimmed.slice(0, idx).trim()
  const awbNo = trimmed.slice(idx + 1).replace(/-/g, '').trim()
  if (!carrierCode || !awbNo) return null
  return { carrierCode, awbNo }
}
