/**
 * Ordered column keys per table, matching the DB entity definitions exactly.
 * Labels are auto-derived as uppercase words; override via COLUMN_LABELS if needed.
 */

export const SHIPMENT_SYSTEM = ['is_locked', 'id', 'last_synced_at', 'created_at', 'updated_at']

const SHIPMENT_APP_SHARED = [
  'date',
  'lt_number',
  'to_number',
  'is_locked',
  'origin',
  'destination',
  'gross_weight',
  'qty_parcel',
  'remarks',
  'slot',
  'driver_name_pickup',
  'nopol_pickup',
  'vehicle_type_pickup',
  'ata_origin',
  'atd_origin',
  'awb',
  'actual_airline_name',
  'flight_no',
  'stt',
  'p_panjang',
  'l_lebar',
  't_tinggi',
  'chargeable_weight_btb_awb',
  'atd_flight',
  'ata_flight',
  'nopol_dooring',
  'vehicle_type_dooring',
  'ata_vendor_wh_destination',
  'link_evidence_of_arrival_wh_destination',
  'issue',
  'remarks_mandatory',
  'dooring_activity_vendor',
  'arrival_status_vendor',
  'eta_spx_wh_destination',
  'completed_time',
  'helper_time_departure',
  'helper_ptpdtd',
  'vendor',
]

const CGK_EXTRA_APP = [
  'helper_ptpdtd_2',
  'origin_station',
  'destination_station',
  'concat',
  'rate_spx_after_pph_disc',
  'amount_revenue',
  'additional_amount_packing_kayu',
  'concat_route',
  'sla',
  'tjph',
  'max_sla',
  'max_tjph',
  'remarks_sla',
  'remarks_tjph',
  'late_duration_sla',
  'late_duration_tjph',
]

export const COLUMN_KEYS: Record<string, string[]> = {
  air_shipments_cgk: [...new Set([...SHIPMENT_APP_SHARED, ...CGK_EXTRA_APP, ...SHIPMENT_SYSTEM])],
  air_shipments_sub: [...new Set([...SHIPMENT_APP_SHARED, ...SHIPMENT_SYSTEM])],
  air_shipments_sda: [...new Set([...SHIPMENT_APP_SHARED, ...SHIPMENT_SYSTEM])],
  rate_per_station: [
    // 'id',
    'is_locked',
    'dc',
    'station',
    'origin_city',
    'origin_dc',
    'destination_city',
    'destination_dc',
    'origin_station',
    'destination_station',
    'concat',
    'rate_spx',
    'pph_2',
    'disc_15',
    'rate_spx_after_pph_disc',
    'sla',
    'lost_treshold',
    'last_synced_at',
    'created_at',
    'updated_at',
  ],
  route_master: [
    // 'id',
    'is_locked',
    'origin',
    'destination',
    'concat',
    'sla',
    'tjph',
    'last_synced_at',
    'created_at',
    'updated_at',
  ],
}

/** Convert snake_case key to a human-readable uppercase label. */
export function colLabel(key: string): string {
  return key.replace(/_/g, ' ').toUpperCase()
}

// Always-visible (frozen) columns for CGK, SDA, SUB
export const FROZEN_KEYS = ['date', 'lt_number', 'to_number', 'is_locked']
export const airShipmentTable = ['air_shipments_cgk', 'air_shipments_sda', 'air_shipments_sub']
