import { coerceTrackingPayload, parseTracking, splitAwb, toTrackingRow } from './airline-tracking.parser'

describe('airline-tracking parser', () => {
  // Mirrors the real Cargoflash response: booked QG-0480 on 04 Jun, but the cargo
  // actually departed across QG-0728 (04 Jun) then QG-0484/0486/0488 (05 Jun).
  const sample = {
    Table0: [{ FlightNo: '', FlightDate: '03 Jun 2026' }],
    Table3: [
      { Action: 'BKD', FlightNo: 'QG-0480', FlightDate: '04 Jun 2026' },
      { Action: 'RCS', FlightNo: 'QG-0490', FlightDate: '04 Jun 2026' },
      { Action: 'DEP', FlightNo: 'QG-0728', FlightDate: '04 Jun 2026' },
      { Action: 'DEP', FlightNo: 'QG-0484', FlightDate: '05 Jun 2026' },
      { Action: 'DEP', FlightNo: 'QG-0486', FlightDate: '05 Jun 2026' },
      { Action: 'DEP', FlightNo: 'QG-0488', FlightDate: '05 Jun 2026' },
    ],
  }

  it('parses booked date/flight from the BKD record and DEP legs in order', () => {
    const parsed = parseTracking(sample)
    expect(parsed.bookedDate).toBe('04 Jun 2026')
    expect(parsed.bookedFlightNo).toBe('QG-0480')
    expect(parsed.depLegs.map((l) => l.flightNo)).toEqual(['QG-0728', 'QG-0484', 'QG-0486', 'QG-0488'])
  })

  it('flags offload when a DEP2+ flight date differs from the booked date', () => {
    expect(parseTracking(sample).offload).toBe(true)
  })

  it('is onboard when only DEP1 differs (a delay, not an offload)', () => {
    const delayed = {
      Table3: [
        { Action: 'BKD', FlightNo: 'QG-0480', FlightDate: '04 Jun 2026' },
        { Action: 'DEP', FlightNo: 'QG-0480', FlightDate: '05 Jun 2026' }, // DEP1 late
        { Action: 'DEP', FlightNo: 'QG-0480', FlightDate: '04 Jun 2026' }, // DEP2 == booked
      ],
    }
    expect(parseTracking(delayed).offload).toBe(false)
  })

  it('is onboard with a single departure', () => {
    const single = {
      Table3: [
        { Action: 'BKD', FlightNo: 'QG-0480', FlightDate: '04 Jun 2026' },
        { Action: 'DEP', FlightNo: 'QG-0728', FlightDate: '04 Jun 2026' },
      ],
    }
    expect(parseTracking(single).offload).toBe(false)
  })

  it('is onboard when there are no departures yet', () => {
    const notDeparted = { Table3: [{ Action: 'BKD', FlightNo: 'QG-0480', FlightDate: '04 Jun 2026' }] }
    const parsed = parseTracking(notDeparted)
    expect(parsed.depLegs).toHaveLength(0)
    expect(parsed.offload).toBe(false)
  })

  it('coerces single- and double-encoded JSON-string payloads', () => {
    // Real endpoints return double-encoded JSON: "{\"Table0\":...}"
    const single = JSON.stringify(sample)
    const double = JSON.stringify(single)
    expect(parseTracking(coerceTrackingPayload(single)).offload).toBe(true)
    expect(parseTracking(coerceTrackingPayload(double)).offload).toBe(true)
    expect(coerceTrackingPayload('not json')).toBeNull()
  })

  it('maps parsed legs to display columns', () => {
    const row = toTrackingRow('888-11153041', '888', parseTracking(sample))
    expect(row.std_booking).toBe('04 Jun 2026')
    expect(row.std_flight_no).toBe('QG-0480')
    expect(row.actual_flight_dep).toBe('04 Jun 2026')
    expect(row.dep2).toBe('05 Jun 2026')
    expect(row.offload).toBe(true)
  })

  it('splits a full AWB into carrier code + number', () => {
    expect(splitAwb('778-04070113')).toEqual({ carrierCode: '778', awbNo: '04070113' })
    expect(splitAwb('888-11153041')).toEqual({ carrierCode: '888', awbNo: '11153041' })
    expect(splitAwb('nodash')).toBeNull()
  })
})
