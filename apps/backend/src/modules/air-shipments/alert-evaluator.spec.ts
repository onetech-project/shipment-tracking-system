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
    ata_origin: '2025-01-01T08:00:00Z', // now set to 08:30 — 30min after arrival
    sla: '02:00:00', // maxSla = 10:00
    tjph: '04:00:00', // maxTjph = 12:00
    ata_flight: '2025-01-01T09:00:00Z',
    atd_flight: '2025-01-01T08:30:00Z',
  }
  const N = 1 // n_hours = 1h: now must be > ata_origin + 1h
  const M = 1 // m_hours = 1h: ata_flight + 1h vs deadlines

  it('returns all false when no alerts are triggered', () => {
    jest.setSystemTime(new Date('2025-01-01T08:30:00Z')) // 30min after ata_origin, all fields present
    expect(evaluateAlerts(baseRow, N, M)).toEqual({
      reservasiPenerbangan: false,
      potensiMelebihiSla: false,
      melewatiSla: false,
      potensiMelebihiTjph: false,
      melewatiTjph: false,
    })
  })

  describe('reservasiPenerbangan', () => {
    it('triggers when now > ataOrigin + nHours and both atd_flight and ata_flight are empty', () => {
      // ata_origin = 08:00, n=1h → threshold = 09:00; now = 09:30 → should trigger
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(true)
    })

    it('does NOT trigger when now is before ataOrigin + nHours', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z')) // only 30min after ata_origin
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when atd_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_flight: '' }, // atd_flight is present in baseRow
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when ata_flight is present', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, atd_flight: '' }, // ata_flight is present in baseRow
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })

    it('does NOT trigger when ata_origin is null', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(
        evaluateAlerts(
          { ...baseRow, ata_origin: '', atd_flight: '', ata_flight: '' },
          N,
          M,
        ).reservasiPenerbangan,
      ).toBe(false)
    })
  })

  describe('potensiMelebihiSla', () => {
    it('triggers when ata_flight + mHours > maxSla', () => {
      // ata_origin=08:00, sla=02:00 → maxSla=10:00
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
  })

  describe('melewatiSla', () => {
    it('triggers when now > maxSla', () => {
      // ata_origin=08:00, sla=02:00 → maxSla=10:00; now=10:30
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiSla).toBe(true)
    })

    it('does NOT trigger when now <= maxSla', () => {
      jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiSla).toBe(false)
    })

    it('does NOT trigger when sla is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts({ ...baseRow, sla: '' }, N, M).melewatiSla).toBe(false)
    })

    it('does NOT trigger when ata_origin is missing', () => {
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts({ ...baseRow, ata_origin: '' }, N, M).melewatiSla).toBe(false)
    })
  })

  describe('potensiMelebihiTjph', () => {
    it('triggers via melewatiSla path (independent of ata_flight)', () => {
      // now > maxSla (=10:00) → melewatiSla=true → potensiMelebihiTjph=true
      jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).potensiMelebihiTjph).toBe(true)
    })

    it('triggers via ata_flight + mHours > maxTjph path (melewatiSla=false)', () => {
      // ata_origin=08:00, sla=06:00→maxSla=14:00 (now < maxSla so melewatiSla=false)
      // tjph=03:00 → maxTjph=11:00; ata_flight=10:30, m=1h → 11:30 > maxTjph=11:00 → trigger
      jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
      expect(
        evaluateAlerts(
          {
            ...baseRow,
            sla: '06:00:00',
            tjph: '03:00:00',
            ata_flight: '2025-01-01T10:30:00Z',
          },
          N,
          M,
        ).potensiMelebihiTjph,
      ).toBe(true)
    })

    it('does NOT trigger when neither condition is met', () => {
      jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
      expect(evaluateAlerts(baseRow, N, M).potensiMelebihiTjph).toBe(false)
    })
  })

  describe('melewatiTjph', () => {
    it('triggers when now > maxTjph', () => {
      // ata_origin=08:00, tjph=04:00 → maxTjph=12:00; now=13:00
      jest.setSystemTime(new Date('2025-01-01T13:00:00Z'))
      expect(evaluateAlerts(baseRow, N, M).melewatiTjph).toBe(true)
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
    // ata_origin=2025-01-01T00:00:00Z, tjph=25:00:00 → maxTjph = 2025-01-02T01:00:00Z
    // now = 2025-01-02T02:00:00Z → melewatiTjph = true
    jest.setSystemTime(new Date('2025-01-02T02:00:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          ata_origin: '2025-01-01T00:00:00Z',
          sla: '24:00:00',
          tjph: '25:00:00',
        },
        N,
        M,
      ).melewatiTjph,
    ).toBe(true)
  })

  it('reads fields from extra_fields JSONB when not on top-level', () => {
    // ata_origin and sla in extra_fields; now > maxSla → melewatiSla
    jest.setSystemTime(new Date('2025-01-01T11:00:00Z'))
    expect(
      evaluateAlerts(
        {
          extra_fields: {
            ata_origin: '2025-01-01T08:00:00Z',
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

  it('ALERT_TYPES array contains exactly the 5 new types', () => {
    expect(ALERT_TYPES).toEqual([
      'reservasiPenerbangan',
      'potensiMelebihiSla',
      'melewatiSla',
      'potensiMelebihiTjph',
      'melewatiTjph',
    ])
  })
})
