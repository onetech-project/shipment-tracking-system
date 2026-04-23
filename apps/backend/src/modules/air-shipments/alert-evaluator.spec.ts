import { evaluateAlerts, AlertType, ALERT_TYPES } from './alert-evaluator'

describe('evaluateAlerts', () => {
  const baseRow = {
    sla: '00:10:00',
    tjph: '00:05:00',
    ata_flight: '2025-01-01T10:00:00Z',
    atd_flight: '2025-01-01T09:00:00Z',
    tracking_smu: 'SMU123',
  }

  it('returns all false when all values are present', () => {
    expect(evaluateAlerts(baseRow)).toEqual({
      slaAlert: false,
      tjphAlert: false,
      ataFlightAlert: false,
      atdFlightAlert: false,
      smuAlert: false,
    })
  })

  it.each<AlertType>(ALERT_TYPES)('returns true for %s when the field is null', (alertType) => {
    const row = { ...baseRow } as Record<string, unknown>
    const field = {
      slaAlert: 'sla',
      tjphAlert: 'tjph',
      ataFlightAlert: 'ata_flight',
      atdFlightAlert: 'atd_flight',
      smuAlert: 'tracking_smu',
    }[alertType]

    row[field] = null
    const result = evaluateAlerts(row)
    expect(result[alertType]).toBe(true)
  })

  it.each<AlertType>(ALERT_TYPES)(
    'returns true for %s when the field is an empty string',
    (alertType) => {
      const row = { ...baseRow } as Record<string, unknown>
      const field = {
        slaAlert: 'sla',
        tjphAlert: 'tjph',
        ataFlightAlert: 'ata_flight',
        atdFlightAlert: 'atd_flight',
        smuAlert: 'tracking_smu',
      }[alertType]

      row[field] = ''
      const result = evaluateAlerts(row)
      expect(result[alertType]).toBe(true)
    }
  )

  it('detects tracking_smu in extra_fields', () => {
    const row = {
      sla: '00:10:00',
      tjph: '00:05:00',
      ata_flight: '2025-01-01T10:00:00Z',
      atd_flight: '2025-01-01T09:00:00Z',
      extra_fields: { tracking_smu: '' },
    }

    expect(evaluateAlerts(row)).toEqual({
      slaAlert: false,
      tjphAlert: false,
      ataFlightAlert: false,
      atdFlightAlert: false,
      smuAlert: true,
    })
  })
})
