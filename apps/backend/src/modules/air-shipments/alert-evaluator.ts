export type AlertType = 'slaAlert' | 'tjphAlert' | 'ataFlightAlert' | 'atdFlightAlert' | 'smuAlert'

export interface AlertFlags {
  slaAlert: boolean
  tjphAlert: boolean
  ataFlightAlert: boolean
  atdFlightAlert: boolean
  smuAlert: boolean
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

const getFieldValue = (row: Record<string, unknown>, key: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    return row[key]
  }

  const extraFields = row.extra_fields
  if (extraFields && typeof extraFields === 'object') {
    return (extraFields as Record<string, unknown>)[key]
  }

  return undefined
}

export function evaluateAlerts(row: Record<string, unknown>): AlertFlags {
  return {
    slaAlert: isEmptyValue(getFieldValue(row, 'sla')),
    tjphAlert: isEmptyValue(getFieldValue(row, 'tjph')),
    ataFlightAlert: isEmptyValue(getFieldValue(row, 'ata_flight')),
    atdFlightAlert: isEmptyValue(getFieldValue(row, 'atd_flight')),
    smuAlert: isEmptyValue(getFieldValue(row, 'tracking_smu')),
  }
}

export const ALERT_TYPES: AlertType[] = [
  'slaAlert',
  'tjphAlert',
  'ataFlightAlert',
  'atdFlightAlert',
  'smuAlert',
]

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  slaAlert: 'SLA Alert',
  tjphAlert: 'TJPH Alert',
  ataFlightAlert: 'ATA Flight Alert',
  atdFlightAlert: 'ATD Flight Alert',
  smuAlert: 'SMU Alert',
}
