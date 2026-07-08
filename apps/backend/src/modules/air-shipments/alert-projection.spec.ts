import { AirShipmentsService } from './air-shipments.service'
import { AIR_ALERT_PROFILE, SEA_ALERT_PROFILE } from './alert-evaluator'

describe('alertProjectionFields', () => {
  const fields = (profile: any) =>
    new Set<string>((AirShipmentsService as any).alertProjectionFields(profile))

  it('AIR profile projects exactly the legacy field set', () => {
    expect(fields(AIR_ALERT_PROFILE)).toEqual(
      new Set([
        'awb',
        'atd_origin',
        'sla',
        'tjph',
        'ata_flight',
        'atd_flight',
        'trackingan_smu',
        'completed_time',
        'ata_vendor_wh_destination',
        'origin',
        'destination',
        'gross_weight',
      ])
    )
  })

  it('SEA profile projects sea fields and omits SMU tracking', () => {
    expect(fields(SEA_ALERT_PROFILE)).toEqual(
      new Set([
        'actual_ship_name',
        'atd_origin',
        'sla',
        'tjph',
        'ata_sailing',
        'atd_sailing',
        'trip_completed',
        'ata_vendor_wh_destination_sertakan_link_evidence',
        'origin',
        'destination',
        'gross_weight',
      ])
    )
  })
})
