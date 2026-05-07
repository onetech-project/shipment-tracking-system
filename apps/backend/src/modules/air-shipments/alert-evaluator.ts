export type AlertType =
  | 'reservasiPenerbangan'
  | 'potensiMelebihiSla'
  | 'melewatiSla'
  | 'potensiMelebihiTjph'
  | 'melewatiTjph'

export type AlertFilter = AlertType | 'normal'

export interface AlertFlags {
  reservasiPenerbangan: boolean
  potensiMelebihiSla: boolean
  melewatiSla: boolean
  potensiMelebihiTjph: boolean
  melewatiTjph: boolean
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
function parseDuration(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

function parseDurationSafe(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return parseDuration(value)
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
): AlertFlags {
  const now = new Date()

  const ataOrigin = parseDate(getFieldValue(row, 'ata_origin'))
  const slaTime = parseDurationSafe(getFieldValue(row, 'sla'))
  const tjphTime = parseDurationSafe(getFieldValue(row, 'tjph'))
  const ataFlight = getFieldValue(row, 'ata_flight')
  const atdFlight = getFieldValue(row, 'atd_flight')
  const ataFlightDate = parseDate(ataFlight)
  const trackinganSmu = getFieldValue(row, 'trackingan_smu')
  // Only flag SMU as "not onboard" when there is an explicit non-empty status that isn't "Onboard".
  // Missing/empty means no Reservasi record was found — don't trigger on absence of data.
  const smuNotOnboard =
    typeof trackinganSmu === 'string' &&
    trackinganSmu.trim() !== '' &&
    trackinganSmu.trim().toLowerCase() !== 'onboard'

  const maxSla = ataOrigin && slaTime !== null ? new Date(ataOrigin.getTime() + slaTime) : null
  const maxTjph = ataOrigin && tjphTime !== null ? new Date(ataOrigin.getTime() + tjphTime) : null
  const nMs = nHours * 3_600_000
  const mMs = mHours * 3_600_000

  const completedTime = parseDate(getFieldValue(row, 'completed_time'))
  const effectiveTime = completedTime ?? now

  const melewatiSla = maxSla !== null && effectiveTime > maxSla
  const melewatiTjph = maxTjph !== null && effectiveTime > maxTjph

  if (melewatiTjph) {
    return {
      reservasiPenerbangan: false,
      potensiMelebihiSla: false,
      melewatiSla: false,
      potensiMelebihiTjph: false,
      melewatiTjph: true,
    }
  }

  return {
    reservasiPenerbangan:
      ataOrigin !== null &&
      now > new Date(ataOrigin.getTime() + nMs) &&
      isEmptyValue(atdFlight) &&
      isEmptyValue(ataFlight),

    potensiMelebihiSla:
      (ataFlightDate !== null &&
        maxSla !== null &&
        new Date(ataFlightDate.getTime() + mMs) > maxSla) ||
      (!isEmptyValue(atdFlight) && smuNotOnboard),

    melewatiSla,

    potensiMelebihiTjph:
      ataFlightDate !== null &&
      maxTjph !== null &&
      new Date(ataFlightDate.getTime() + mMs) > maxTjph,

    melewatiTjph: false,
  }
}

export const ALERT_TYPES: AlertType[] = [
  'reservasiPenerbangan',
  'potensiMelebihiSla',
  'melewatiSla',
  'potensiMelebihiTjph',
  'melewatiTjph',
]

export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal']

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  reservasiPenerbangan: 'Reservasi Penerbangan',
  potensiMelebihiSla: 'Potensi Melebihi SLA',
  melewatiSla: 'Melewati SLA',
  potensiMelebihiTjph: 'Potensi Melebihi TJPH',
  melewatiTjph: 'Melewati TJPH',
}
