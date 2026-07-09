export type AlertType =
  | 'reservasiPenerbangan'
  | 'reservasiKapal'
  | 'flightTracking'
  | 'potensiMelebihiSla'
  | 'melewatiSla'
  | 'potensiMelebihiTjph'
  | 'melewatiTjph'
  | 'spxTjphAlert'
  | 'spxSlaAlert'

export type AlertFilter = AlertType | 'normal' | 'any'

export type AlertFlags = Record<AlertType, boolean>

/**
 * Field mapping + enabled alert set for one transport mode. The evaluator only
 * reads row fields through this profile, so AIR and SEA sheets (different
 * column names, same semantics) share one rule implementation.
 */
export interface AlertProfile {
  key: 'air' | 'sea'
  /** Alert types this profile computes; all others are always false. */
  alertTypes: AlertType[]
  /** Completion field driving SLA/TJPH breaches, OTP, and the VOID check. */
  completionField: string
  /** Completion field driving the SPX alerts. */
  spxCompletionField: string
  /** Transport arrival (flight/vessel) — the potential-breach reference. */
  arrivalField: string
  /** Transport departure — reservation guard. */
  departureField: string
  /** Field whose emptiness means "not booked/reserved". */
  reservationField: string
  /** Which reservation alert key this profile produces. */
  reservationAlertType: AlertType
  /** Whether SMU/offload signals apply (air only). */
  useSmuTracking: boolean
}

export const AIR_ALERT_PROFILE: AlertProfile = {
  key: 'air',
  alertTypes: [
    'reservasiPenerbangan',
    'flightTracking',
    'potensiMelebihiSla',
    'melewatiSla',
    'potensiMelebihiTjph',
    'melewatiTjph',
    'spxTjphAlert',
    'spxSlaAlert',
  ],
  completionField: 'ata_vendor_wh_destination',
  spxCompletionField: 'completed_time',
  arrivalField: 'ata_flight',
  departureField: 'atd_flight',
  reservationField: 'awb',
  reservationAlertType: 'reservasiPenerbangan',
  useSmuTracking: true,
}

export const SEA_ALERT_PROFILE: AlertProfile = {
  key: 'sea',
  alertTypes: [
    'reservasiKapal',
    'potensiMelebihiSla',
    'melewatiSla',
    'potensiMelebihiTjph',
    'melewatiTjph',
    'spxSlaAlert',
    'spxTjphAlert',
  ],
  completionField: 'ata_vendor_wh_destination_sertakan_link_evidence',
  spxCompletionField: 'trip_completed',
  arrivalField: 'ata_sailing',
  departureField: 'atd_sailing',
  reservationField: 'actual_ship_name',
  reservationAlertType: 'reservasiKapal',
  useSmuTracking: false,
}

/** Dynamic table backing the sea SLA profile (the CompileSeaNonJava sheet sync). */
export const SEA_SLA_TABLE_NAME = 'air_shipments_compileseanonjava'

/**
 * Maps a dynamic table name to its alert profile. Any table other than the sea
 * table uses the AIR profile.
 */
export function resolveAlertProfile(
  tableName: string,
  seaTableName: string = SEA_SLA_TABLE_NAME,
): AlertProfile {
  return seaTableName.trim() !== '' && tableName.trim() === seaTableName.trim()
    ? SEA_ALERT_PROFILE
    : AIR_ALERT_PROFILE
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
  mHours: number,
  now: Date = new Date(),
  profile: AlertProfile = AIR_ALERT_PROFILE
): AlertFlags {
  const atdOrigin = parseDate(getFieldValue(row, 'atd_origin'))
  const slaTime = parseDurationSafe(getFieldValue(row, 'sla'))
  const tjphTime = parseDurationSafe(getFieldValue(row, 'tjph'))
  const arrival = getFieldValue(row, profile.arrivalField)
  const departure = getFieldValue(row, profile.departureField)
  const arrivalDate = parseDate(arrival)
  const reservationValue = getFieldValue(row, profile.reservationField)
  const trackinganSmu = profile.useSmuTracking ? getFieldValue(row, 'trackingan_smu') : undefined
  // Flight offload state for this AWB, joined from Tracking_SMU (air_shipments_tracking_smu)
  // by the service enrichment. `offload_has_evidence` is true once a justification link
  // is recorded — which excludes the AWB (and all its TOs) from the Flight Tracking alert.
  const offloadStatus = profile.useSmuTracking ? getFieldValue(row, 'offload_status') : undefined
  const isOffloaded =
    typeof offloadStatus === 'string' && offloadStatus.trim().toLowerCase() === 'offload'
  const offloadHasEvidence =
    profile.useSmuTracking && getFieldValue(row, 'offload_has_evidence') === true
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

  const completedTime = parseDate(getFieldValue(row, profile.completionField))
  const effectiveTime = completedTime ?? now

  const spxCompletedTime = parseDate(getFieldValue(row, profile.spxCompletionField))
  const spxEffectiveTime = spxCompletedTime ?? now

  // Shared base condition for the reservation alert: departed origin, past the
  // n-hour grace window, transport not yet departed/arrived, not completed.
  const reservationAlertBase =
    isEmptyValue(completedTime) &&
    atdOrigin !== null &&
    now > new Date(atdOrigin.getTime() + nMs) &&
    isEmptyValue(departure) &&
    isEmptyValue(arrival)

  const flags: AlertFlags = {
    reservasiPenerbangan: false,
    reservasiKapal: false,
    flightTracking: false,
    potensiMelebihiSla: false,
    melewatiSla: false,
    potensiMelebihiTjph: false,
    melewatiTjph: false,
    spxTjphAlert: false,
    spxSlaAlert: false,
  }

  // Empty reservation field = flight/vessel hasn't been booked yet
  flags[profile.reservationAlertType] = isEmptyValue(reservationValue) && reservationAlertBase
  // AWB offloaded per Tracking_SMU and not yet justified with an evidence link
  flags.flightTracking = isOffloaded && !offloadHasEvidence

  flags.potensiMelebihiSla =
    isEmptyValue(completedTime) &&
    ((arrivalDate !== null && maxSla !== null && new Date(arrivalDate.getTime() + mMs) > maxSla) ||
      (!isEmptyValue(departure) && smuNotOnboard))

  flags.melewatiSla = maxSla !== null && effectiveTime > maxSla

  flags.potensiMelebihiTjph =
    isEmptyValue(completedTime) &&
    arrivalDate !== null &&
    maxTjph !== null &&
    new Date(arrivalDate.getTime() + mMs) > maxTjph

  flags.melewatiTjph = maxTjph !== null && effectiveTime > maxTjph

  flags.spxTjphAlert = maxTjph !== null && spxEffectiveTime > maxTjph
  flags.spxSlaAlert = maxSla !== null && spxEffectiveTime > maxSla

  // Mask alerts the profile doesn't compute
  const enabled = new Set(profile.alertTypes)
  for (const key of Object.keys(flags) as AlertType[]) {
    if (!enabled.has(key)) flags[key] = false
  }
  return flags
}

export const ALERT_TYPES: AlertType[] = [
  'reservasiPenerbangan',
  'reservasiKapal',
  'flightTracking',
  'potensiMelebihiSla',
  'melewatiSla',
  'potensiMelebihiTjph',
  'melewatiTjph',
  'spxTjphAlert',
  'spxSlaAlert',
]

export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal', 'any']

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  reservasiPenerbangan: 'Reservasi Penerbangan',
  reservasiKapal: 'Reservasi Kapal',
  flightTracking: 'Flight Tracking',
  potensiMelebihiSla: 'Potensi Melebihi SLA',
  melewatiSla: 'Melewati SLA',
  potensiMelebihiTjph: 'Potensi Melebihi TJPH',
  melewatiTjph: 'Melewati TJPH',
  spxTjphAlert: 'SPX TJPH Alert',
  spxSlaAlert: 'SPX SLA Alert',
}
