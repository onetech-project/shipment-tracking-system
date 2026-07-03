import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Airline-API DEP source for the Flight Tracking offload alert.
 *
 * - `airline_tracking_source`: config registry of {carrier_code, url, payload}. Adding a
 *   new airline = inserting a row (no code change). `payload` is a query-param template
 *   whose `{awbNo}` / `{carrierCode}` placeholders are substituted per request.
 * - `air_shipments_awb_flight_tracking`: per-AWB fetch results. Offload is computed in
 *   TypeScript (DEP2-onward rule) and stored as a boolean; the display columns mirror
 *   air_shipments_tracking_smu so the offloaded-AWB list can UNION both sources trivially.
 */
export class AirlineTracking20260624000010 implements MigrationInterface {
  name = 'AirlineTracking20260624000010'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Config registry
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS airline_tracking_source (
        carrier_code TEXT        PRIMARY KEY,
        name         TEXT,
        url          TEXT        NOT NULL,
        payload      JSONB       NOT NULL DEFAULT '{}'::jsonb,
        enabled      BOOLEAN     NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const garudaUrl =
      'https://icms.garuda-indonesia.com/Services/Shipment/AWBTrackingService.svc/GetAWBTrackingRecord'
    const pelitaUrl =
      'https://pelitacargo.cargoflash.com/Services/Shipment/AWBTrackingService.svc/GetAWBTrackingRecord'
    const payload = JSON.stringify({
      AWBNo: '{awbNo}',
      BasedOn: '0',
      AccountSNo: '0',
      flag: '0',
      CarrierCode: '{carrierCode}',
    })

    await queryRunner.query(
      `INSERT INTO airline_tracking_source (carrier_code, name, url, payload, enabled) VALUES
         ('126', 'Citilink/Garuda', $1, $3::jsonb, true),
         ('888', 'Garuda/Citilink', $1, $3::jsonb, true),
         ('778', 'Pelita',          $2, $3::jsonb, true)
       ON CONFLICT (carrier_code) DO NOTHING`,
      [garudaUrl, pelitaUrl, payload]
    )

    // 2) Per-AWB fetch results (display columns mirror air_shipments_tracking_smu)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_awb_flight_tracking (
        awb               TEXT        PRIMARY KEY,
        carrier_code      TEXT,
        std_booking       TEXT,
        std_flight_no     TEXT,
        actual_flight_dep TEXT,
        dep_flight_no     TEXT,
        dep2              TEXT,
        dep2_flight_no    TEXT,
        dep3              TEXT,
        dep3_flight_no    TEXT,
        dep4              TEXT,
        dep4_flight_no    TEXT,
        dep5              TEXT,
        dep5_flight_no    TEXT,
        offload           BOOLEAN     NOT NULL DEFAULT false,
        fetched_at        TIMESTAMPTZ,
        http_ok           BOOLEAN,
        error             TEXT,
        raw               JSONB,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_awb_flight_tracking_carrier ON air_shipments_awb_flight_tracking(carrier_code)`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_awb_flight_tracking_offload ON air_shipments_awb_flight_tracking(offload)`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS air_shipments_awb_flight_tracking`)
    await queryRunner.query(`DROP TABLE IF EXISTS airline_tracking_source`)
  }
}
