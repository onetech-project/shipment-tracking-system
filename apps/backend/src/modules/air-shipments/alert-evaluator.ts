export type AlertType =
  | 'reservasiPenerbangan'
  | 'flightTracking'
  | 'potensiMelebihiSla'
  | 'melewatiSla'
  | 'potensiMelebihiTjph'
  | 'melewatiTjph'
  | 'spxTjphAlert'

export type AlertFilter = AlertType | 'normal' | 'any'

export interface AlertFlags {
  reservasiPenerbangan: boolean
  flightTracking: boolean
  potensiMelebihiSla: boolean
  melewatiSla: boolean
  potensiMelebihiTjph: boolean
  melewatiTjph: boolean
  spxTjphAlert: boolean
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

const getFieldValue = (row: Record<string, unknown>, key: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
  const extraFields = row.extra_fields
  if (extraFields && typeof extraFields === 'object') {
    return (extraFields as Record<string, unknown>)[key]
  }
  return undefined
}

// SLA and TJPH are HH:MM:SS strings; hours CAN exceed 23 — do NOT use Date parsing
function parseDuration(value: string): number | null {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null
  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

// Handles two formats:
//   HH:MM:SS (e.g. "24:00:00") — from air_shipments_compileaircgk
//   plain integer hours (e.g. "24" or 24) — from air_shipments_data.sla / lost_treshold
export function parseDurationSafe(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const str = typeof value === 'number' ? String(value) : value
  if (typeof str !== 'string' || !str.trim()) return null
  if (str.includes(':')) return parseDuration(str) // may return null on malformed input
  const h = parseFloat(str)
  return isNaN(h) ? null : h * 3_600_000
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export function evaluateAlerts(
  row: Record<string, unknown>,
  nHours: number,
  mHours: number
): AlertFlags {
  const now = new Date()

  const atdOrigin = parseDate(getFieldValue(row, 'atd_origin'))
  const slaTime = parseDurationSafe(getFieldValue(row, 'sla'))
  const tjphTime = parseDurationSafe(getFieldValue(row, 'tjph'))
  const ataFlight = getFieldValue(row, 'ata_flight')
  const atdFlight = getFieldValue(row, 'atd_flight')
  const ataFlightDate = parseDate(ataFlight)
  const trackinganSmu = getFieldValue(row, 'trackingan_smu')
  const awb = getFieldValue(row, 'awb')
  // Only flag SMU as "not onboard" when there is an explicit non-empty status that isn't "Onboard".
  // Missing/empty means no Reservasi record was found — don't trigger on absence of data.
  const smuNotOnboard =
    typeof trackinganSmu === 'string' &&
    trackinganSmu.trim() !== '' &&
    trackinganSmu.trim().toLowerCase() !== 'onboard'

  const maxSla = atdOrigin && slaTime !== null ? new Date(atdOrigin.getTime() + slaTime) : null
  const maxTjph = atdOrigin && tjphTime !== null ? new Date(atdOrigin.getTime() + tjphTime) : null
  const nMs = nHours * 3_600_000
  const mMs = mHours * 3_600_000

  const completedTime = parseDate(getFieldValue(row, 'ata_vendor_wh_destination'))
  const effectiveTime = completedTime ?? now

  const spxCompletedTime = parseDate(getFieldValue(row, 'completed_time'))
  const spxEffectiveTime = spxCompletedTime ?? now

  const melewatiSla = maxSla !== null && effectiveTime > maxSla
  const melewatiTjph = maxTjph !== null && effectiveTime > maxTjph

  // Shared base condition for both flight-booking alerts; split by AWB presence
  const flightBookingAlertBase =
    isEmptyValue(completedTime) &&
    atdOrigin !== null &&
    now > new Date(atdOrigin.getTime() + nMs) &&
    isEmptyValue(atdFlight) &&
    isEmptyValue(ataFlight)

  return {
    // No AWB = flight hasn't been booked yet
    reservasiPenerbangan: isEmptyValue(awb) && flightBookingAlertBase,
    // Has AWB = flight booked but no tracking data yet
    flightTracking: !isEmptyValue(awb) && flightBookingAlertBase,

    potensiMelebihiSla:
      isEmptyValue(completedTime) &&
      ((ataFlightDate !== null &&
        maxSla !== null &&
        new Date(ataFlightDate.getTime() + mMs) > maxSla) ||
      (!isEmptyValue(atdFlight) && smuNotOnboard)),

    melewatiSla,

    potensiMelebihiTjph:
      isEmptyValue(completedTime) &&
      ataFlightDate !== null &&
      maxTjph !== null &&
      new Date(ataFlightDate.getTime() + mMs) > maxTjph,

    melewatiTjph,

    spxTjphAlert: maxTjph !== null && spxEffectiveTime > maxTjph,
  }
}

export const ALERT_TYPES: AlertType[] = [
  'reservasiPenerbangan',
  'flightTracking',
  'potensiMelebihiSla',
  'melewatiSla',
  'potensiMelebihiTjph',
  'melewatiTjph',
  'spxTjphAlert',
]

export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal', 'any']

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  reservasiPenerbangan: 'Reservasi Penerbangan',
  flightTracking: 'Flight Tracking',
  potensiMelebihiSla: 'Potensi Melebihi SLA',
  melewatiSla: 'Melewati SLA',
  potensiMelebihiTjph: 'Potensi Melebihi TJPH',
  melewatiTjph: 'Melewati TJPH',
  spxTjphAlert: 'SPX TJPH Alert',
}
