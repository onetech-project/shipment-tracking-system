import { evaluateAlerts, ALERT_TYPES } from './alert-evaluator'

describe('evaluateAlerts', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  // Base row: all fields present, now is well within all deadlines
  const baseRow = {
    atd_origin: '2025-01-01T08:00:00Z', // now set to 08:30 — 30min after departure
    awb: 'AWB123', // has AWB → flightTracking path (not reservasiPenerbangan)
    sla: '02:00:00', // maxSla = 10:00
    tjph: '04:00:00', // maxTjph = 12:00
    ata_flight: '2025-01-01T09:00:00Z',
    atd_flight: '2025-01-01T08:30:00Z',
    trackingan_smu: 'Onboard', // SMU already onboard — potensiMelebihiSla SMU path suppressed
  }
  const N = 1 // n_hours = 1h: now must be > atd_origin + 1h
  const M = 1 // m_hours = 1h: ata_flight + 1h vs deadlines

  it('returns all false when no alerts are triggered', () => {
    jest.setSystemTime(new Date('2025-01-01T08:30:00Z')) // 30min after atd_origin, all fields present
    expect(evaluateAlerts(baseRow, N, M)).toEqual({
      reservasiPenerbangan: false,
      flightTracking: false,
      potensiMelebihiSla: false,
      melewatiSla: false,
      potensiMelebihiTjph: false,
      melewatiTjph: false,
      spxTjphAlert: false,
      spxSlaAlert: false,
    })
  })

  describe('reservasiPenerbangan', () => {
    it('triggers when now > atdOrigin + nHours and both atd_flight and ata_flight are empty', () => {
      // atd_origin = 08:00, n=1h → threshold = 09:00; now = 09:30 → should trigger
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(true)
    })

    it('does NOT trigger when now is before atdOrigin + nHours', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z')) // only 30min after atd_origin
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when atd_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', ata_flight: '' }, // atd_flight is present in baseRow
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when ata_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', atd_flight: '' }, // ata_flight is present in baseRow
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when atd_origin is null', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', atd_origin: '', atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('CAN fire together with melewatiSla when SLA also breached', () => {
      // now=10:30 > maxSla=10:00 → melewatiSla=true; reservasiPenerbangan also fires (no guard)
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      const alerts = evaluateAlerts(
        { ...baseRow, awb: '', atd_flight: '', ata_flight: '' },
        N,
        M,
      )
      expect(alerts.reservasiPenerbangan).toBe(true)
      expect(alerts.melewatiSla).toBe(true)
    })
  })

  describe('flightTracking', () => {
    it('triggers when AWB present and same base conditions as reservasiPenerbangan', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', ata_flight: '' }, // baseRow has awb: 'AWB123'
          N, M,
        ).flightTracking,
      ).toBe(true)
    })

    it('does NOT trigger when AWB is empty', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, awb: '', atd_flight: '', ata_flight: '' },
          N, M,
        ).flightTracking,
      ).toBe(false)
    })

    it('does NOT trigger when now is before atdOrigin + nHours', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', ata_flight: '' },
          N, M,
        ).flightTracking,
      ).toBe(false)
    })

    it('does NOT trigger when atd_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '' }, // atd_flight present in baseRow
          N, M,
        ).flightTracking,
      ).toBe(false)
    })

    it('does NOT trigger when ata_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '' }, // ata_flight present in baseRow
          N, M,
        ).flightTracking,
      ).toBe(false)
    })

    it('does NOT trigger when shipment is completed', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', ata_flight: '', ata_vendor_wh_destination: '2025-01-01T09:00:00Z' },
          N, M,
        ).flightTracking,
      ).toBe(false)
    })

    it('CAN fire together with melewatiSla when SLA also breached', () => {
      jest.setSystemTime(new Date('2025-01-01T11:00:00Z'))
      const alerts = evaluateAlerts(
        { ...baseRow, atd_flight: '', ata_flight: '' },
        N, M,
      )
      expect(alerts.flightTracking).toBe(true)
      expect(alerts.melewatiSla).toBe(true)
    })
  })

  describe('multiple alerts can fire simultaneously', () => {
    it('melewatiSla and melewatiTjph can both be true when both thresholds exceeded', () => {
      // atd_origin=08:00, sla=2h (maxSla=10:00), tjph=4h (maxTjph=12:00), now=13:00
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      const alerts = evaluateAlerts(baseRow, N, M)
      expect(alerts.melewatiSla).toBe(true)
      expect(alerts.melewatiTjph).toBe(true)
    })

    it('melewatiSla does NOT suppress potensiMelebihiSla', () => {
      // SLA breached AND ata_flight + m > maxSla
      jest.setSystemTime(new Date('2025-01-01T11:00:00Z'))
      const alerts = evaluateAlerts(
        { ...baseRow, ata_flight: '2025-01-01T09:30:00Z' }, // 09:30+1h=10:30 > maxSla 10:00
        N, M,
      )
      expect(alerts.melewatiSla).toBe(true)
      expect(alerts.potensiMelebihiSla).toBe(true)
    })

    it('melewatiTjph does NOT suppress reservasiPenerbangan', () => {
      // TJPH breached AND no flight data AND AWB empty
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      const alerts = evaluateAlerts(
        { ...baseRow, awb: '', atd_flight: '', ata_flight: '' },
        N, M,
      )
      expect(alerts.melewatiTjph).toBe(true)
      expect(alerts.reservasiPenerbangan).toBe(true)
    })

    it('reservasiPenerbangan and flightTracking are mutually exclusive', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      const rowNoAwb = { ...baseRow, awb: '', atd_flight: '', ata_flight: '' }
      const rowHasAwb = { ...baseRow, awb: 'AWB123', atd_flight: '', ata_flight: '' }
      const alertsNo = evaluateAlerts(rowNoAwb, N, M)
      const alertsHas = evaluateAlerts(rowHasAwb, N, M)
      expect(alertsNo.reservasiPenerbangan).toBe(true)
      expect(alertsNo.flightTracking).toBe(false)
      expect(alertsHas.reservasiPenerbangan).toBe(false)
      expect(alertsHas.flightTracking).toBe(true)
    })
  })

  describe('potensiMelebihiSla', () => {
    it('triggers when ata_flight + mHours > maxSla', () => {
      // atd_origin=08:00, sla=02:00 → maxSla=10:00
      // ata_flight=09:30, m=1h → ata_flight+m = 10:30 > maxSla=10:00 → trigger
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T09:30:00Z' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(true)
    })

    it('does NOT trigger when ata_flight + mHours <= maxSla', () => {
      // ata_flight=08:30, m=1h → 09:30 < maxSla=10:00 → no trigger
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T08:30:00Z' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('does NOT trigger when ata_flight is empty', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_flight: '' }, N, M).potensiMelebihiSla,
      ).toBe(false)
    })

    it('still triggers when melewatiSla is true (no suppression)', () => {
      // now=10:30 > maxSla=10:00 → melewatiSla=true; ata_flight+m also exceeds maxSla → both fire
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T09:30:00Z' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(true)
    })

    it('still triggers via SMU path when melewatiSla is true (no suppression)', () => {
      // now=10:30 > maxSla=10:00 → melewatiSla=true; SMU not onboard and atd_flight present → both fire
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, trackingan_smu: 'In Transit' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(true)
    })

    it('does NOT trigger when sla is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, sla: '', ata_flight: '2025-01-01T09:30:00Z' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('triggers via SMU path when atd_flight is present and trackingan_smu is not Onboard', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T08:30:00Z', trackingan_smu: 'In Transit' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(true)
    })

    it('does NOT trigger via SMU path when trackingan_smu is empty (no Reservasi record)', () => {
      // Missing/empty trackingan_smu means no Reservasi data was joined — should not false-positive
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T08:30:00Z', trackingan_smu: '' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('does NOT trigger via SMU path when trackingan_smu is Onboard (case-insensitive)', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      // ata_flight + m <= maxSla, and SMU is onboard — neither path triggers
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '2025-01-01T08:30:00Z', trackingan_smu: 'ONBOARD' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('does NOT trigger via SMU path when atd_flight is empty', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', trackingan_smu: 'In Transit' },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('reads trackingan_smu from extra_fields when not on top-level', () => {
      // Remove trackingan_smu from top-level so getFieldValue falls through to extra_fields
      const { trackingan_smu: _omit, ...baseWithoutSmu } = { ...baseRow, ata_flight: '2025-01-01T08:30:00Z' }
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseWithoutSmu, extra_fields: { trackingan_smu: 'In Transit' } },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(true)
    })
  })

  describe('melewatiSla', () => {
    it('triggers when now > maxSla (no ata_vendor_wh_destination)', () => {
      // atd_origin=08:00, sla=02:00 → maxSla=10:00; now=10:30
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiSla).toBe(true)
    })

    it('triggers when ata_vendor_wh_destination > maxSla (even if now < maxSla)', () => {
      // now=09:00 < maxSla=10:00, but ata_vendor_wh_destination=10:30 > maxSla → trigger
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T10:30:00Z' }, N, M).melewatiSla,
      ).toBe(true)
    })

    it('does NOT trigger when ata_vendor_wh_destination <= maxSla (even if now > maxSla)', () => {
      // now=10:30 > maxSla=10:00, but ata_vendor_wh_destination=09:30 < maxSla → no trigger
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T09:30:00Z' }, N, M).melewatiSla,
      ).toBe(false)
    })

    it('does NOT trigger when now <= maxSla', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiSla).toBe(false)
    })

    it('does NOT trigger when sla is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts({ ...baseRow, sla: '' }, N, M).melewatiSla).toBe(false)
    })

    it('does NOT trigger when atd_origin is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts({ ...baseRow, atd_origin: '' }, N, M).melewatiSla).toBe(false)
    })
  })

  describe('potensiMelebihiTjph', () => {
    it('triggers when ata_flight + mHours > maxTjph', () => {
      // atd_origin=08:00, tjph=03:00 → maxTjph=11:00; ata_flight=10:30, m=1h → 11:30 > 11:00 → trigger
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, tjph: '03:00:00', ata_flight: '2025-01-01T10:30:00Z' },
          N,
          M,
        ).potensiMelebihiTjph,
      ).toBe(true)
    })

    it('does NOT trigger when melewatiSla is true but ata_flight + mHours <= maxTjph', () => {
      // melewatiSla path was removed — potensiMelebihiTjph is only ata_flight + mMs > maxTjph
      // now=10:30 → melewatiSla=true, but ata_flight(09:00)+1h=10:00 < maxTjph(12:00) → false
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).potensiMelebihiTjph).toBe(false)
    })

    it('does NOT trigger when ata_flight is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_flight: '' }, N, M).potensiMelebihiTjph,
      ).toBe(false)
    })

    it('does NOT trigger when ata_flight + mHours <= maxTjph', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).potensiMelebihiTjph).toBe(false)
    })
  })

  describe('ata_vendor_wh_destination exclusion', () => {
    it('suppresses reservasiPenerbangan when ata_vendor_wh_destination is filled', () => {
      // Without completedTime, reservasiPenerbangan would fire (now > atdOrigin+nH, no flights)
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            awb: '',
            atd_flight: '',
            ata_flight: '',
            ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
          },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('suppresses potensiMelebihiSla when ata_vendor_wh_destination is filled', () => {
      // ata_flight + m > maxSla would normally fire, but completedTime blocks it
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            ata_flight: '2025-01-01T09:30:00Z',
            ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
          },
          N,
          M,
        ).potensiMelebihiSla,
      ).toBe(false)
    })

    it('suppresses potensiMelebihiTjph when ata_vendor_wh_destination is filled', () => {
      // ata_flight + m > maxTjph would normally fire, but completedTime blocks it
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            tjph: '03:00:00',
            ata_flight: '2025-01-01T10:30:00Z',
            ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
          },
          N,
          M,
        ).potensiMelebihiTjph,
      ).toBe(false)
    })

    it('still evaluates melewatiSla normally when ata_vendor_wh_destination is filled', () => {
      // completedTime=09:30 < maxSla=10:00 → melewatiSla stays false
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            ata_vendor_wh_destination: '2025-01-01T09:30:00Z',
          },
          N,
          M,
        ).melewatiSla,
      ).toBe(false)
    })

    it('still evaluates melewatiSla as true when completedTime > maxSla', () => {
      // completedTime=10:30 > maxSla=10:00 → melewatiSla true despite completedTime guard
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            ata_vendor_wh_destination: '2025-01-01T10:30:00Z',
          },
          N,
          M,
        ).melewatiSla,
      ).toBe(true)
    })

    it('melewatiTjph still fires when completedTime > maxTjph, and melewatiSla is also propagated', () => {
      // atd_origin=08:00, sla=02:00 → maxSla=10:00, tjph=04:00 → maxTjph=12:00
      // completedTime=13:00 > maxTjph AND > maxSla → both melewatiTjph and melewatiSla are true
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            ata_vendor_wh_destination: '2025-01-01T13:00:00Z',
          },
          N,
          M,
        ),
      ).toEqual({
        reservasiPenerbangan: false,
        flightTracking: false,
        potensiMelebihiSla: false,
        melewatiSla: true,
        potensiMelebihiTjph: false,
        melewatiTjph: true,
        spxTjphAlert: false,
        spxSlaAlert: false,
      })
    })
  })

  describe('melewatiTjph', () => {
    it('triggers when now > maxTjph (no ata_vendor_wh_destination)', () => {
      // atd_origin=08:00, tjph=04:00 → maxTjph=12:00; now=13:00
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiTjph).toBe(true)
    })

    it('triggers when ata_vendor_wh_destination > maxTjph (even if now < maxTjph)', () => {
      // now=09:00 < maxTjph=12:00, but ata_vendor_wh_destination=13:00 > maxTjph → trigger
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T13:00:00Z' }, N, M).melewatiTjph,
      ).toBe(true)
    })

    it('does NOT trigger when ata_vendor_wh_destination <= maxTjph (even if now > maxTjph)', () => {
      // now=13:00 > maxTjph=12:00, but ata_vendor_wh_destination=11:00 < maxTjph → no trigger
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(
        evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T11:00:00Z' }, N, M).melewatiTjph,
      ).toBe(false)
    })

    it('fires melewatiTjph and melewatiSla simultaneously when both thresholds exceeded', () => {
      // now=13:00 → melewatiTjph=true (maxTjph=12:00) AND melewatiSla=true (maxSla=10:00)
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(evaluateAlerts(baseRow, N, M)).toEqual({
        reservasiPenerbangan: false,
        flightTracking: false,
        potensiMelebihiSla: false,
        melewatiSla: true,
        potensiMelebihiTjph: false,
        melewatiTjph: true,
        spxTjphAlert: true,
        spxSlaAlert: true,
      })
    })

    it('returns only melewatiTjph when melewatiSla is not breached', () => {
      // sla=10:00:00 → maxSla = 08:00+10h = 18:00; now=13:00 < maxSla → melewatiSla=false
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(evaluateAlerts({ ...baseRow, sla: '10:00:00' }, N, M)).toEqual({
        reservasiPenerbangan: false,
        flightTracking: false,
        potensiMelebihiSla: false,
        melewatiSla: false,
        potensiMelebihiTjph: false,
        melewatiTjph: true,
        spxTjphAlert: true,
        spxSlaAlert: false,
      })
    })

    it('does NOT trigger when now <= maxTjph', () => {
      jest.setSystemTime(new Date('2025-01-01T10:00:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiTjph).toBe(false)
    })

    it('does NOT trigger when tjph is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(evaluateAlerts({ ...baseRow, tjph: '' }, N, M).melewatiTjph).toBe(false)
    })
  })

  it('handles duration values with hours above 23', () => {
    // atd_origin=2025-01-01T00:00:00Z, tjph=25:00:00 → maxTjph = 2025-01-02T01:00:00Z
    // now = 2025-01-02T02:00:00Z → melewatiTjph = true
    jest.setSystemTime(new Date('2025-01-02T02:00:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          atd_origin: '2025-01-01T00:00:00Z',
          sla: '24:00:00',
          tjph: '25:00:00',
        },
        N,
        M,
      ).melewatiTjph,
    ).toBe(true)
  })

  it('parseDurationSafe accepts plain integer-string hours ("24" = 24h)', () => {
    // atd_origin=08:00, sla="24" (hours) → maxSla=next day 08:00; now=25h later → breached
    jest.setSystemTime(new Date('2025-01-02T09:00:00Z'))
    expect(
      evaluateAlerts(
        { ...baseRow, sla: '24', tjph: '144' },
        N, M,
      ).melewatiSla,
    ).toBe(true)
  })

  it('parseDurationSafe accepts numeric hours via extra_fields (24 = 24h)', () => {
    // Numeric values arrive from DB as numbers in extra_fields; now=1h after atd_origin, within sla=24h
    jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
    expect(
      evaluateAlerts(
        { ...baseRow, extra_fields: { sla: 24, tjph: 144 } },
        N, M,
      ).melewatiSla,
    ).toBe(false)
  })

  it('reads fields from extra_fields JSONB when not on top-level', () => {
    // atd_origin and sla in extra_fields; now > maxSla → melewatiSla
    jest.setSystemTime(new Date('2025-01-01T11:00:00Z'))
    expect(
      evaluateAlerts(
        {
          extra_fields: {
            atd_origin: '2025-01-01T08:00:00Z',
            awb: 'AWB123',
            sla: '02:00:00',
            tjph: '04:00:00',
            ata_flight: '2025-01-01T09:00:00Z',
            atd_flight: '2025-01-01T08:30:00Z',
          },
        },
        N,
        M,
      ).melewatiSla,
    ).toBe(true)
  })

  it('ALERT_TYPES array contains exactly the 8 alert types', () => {
    expect(ALERT_TYPES).toEqual([
      'reservasiPenerbangan',
      'flightTracking',
      'potensiMelebihiSla',
      'melewatiSla',
      'potensiMelebihiTjph',
      'melewatiTjph',
      'spxTjphAlert',
      'spxSlaAlert',
    ])
  })

  it("ALERT_FILTERS array contains all 8 alert types plus 'normal' and 'any'", () => {
    const { ALERT_FILTERS } = require('./alert-evaluator')
    expect(ALERT_FILTERS).toEqual([
      'reservasiPenerbangan',
      'flightTracking',
      'potensiMelebihiSla',
      'melewatiSla',
      'potensiMelebihiTjph',
      'melewatiTjph',
      'spxTjphAlert',
      'spxSlaAlert',
      'normal',
      'any',
    ])
  })
})
