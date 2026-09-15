import { MigrationInterface, QueryRunner } from 'typeorm'

// Mirrors normalizeNopol in the fleet-vehicles module, expressed in SQL because a migration may
// not import application code — every migration in this repo imports typeorm and nothing else,
// so that a file whose job is to describe one schema change never drifts when the module it
// mirrors is refactored. [[:space:].-] is a POSIX bracket expression: whitespace, a literal dot,
// and a trailing literal hyphen.
const STRIPPED = `upper(regexp_replace(nopol, '[[:space:].-]', '', 'g'))`

// Requirement §1 wants plates stored closed-up (B9114KYZ). Existing rows were written under the
// old rule that kept one space between groups, so they are rewritten here.
//
// This migration can legitimately fail. Deciding which of two colliding units keeps the plate is
// an operator's call about real trucks, not something a migration may guess at, so it stops and
// names them rather than quietly archiving one.
export class FleetNopolNormalize20260912000001 implements MigrationInterface {
  name = 'FleetNopolNormalize20260912000001'

  // A static rather than a bare exported function: TypeORM's data-source glob require()s every
  // file in this directory and calls `new` on each exported function it finds, so a top-level
  // `export function` here is loaded as a bogus migration and aborts migration:run. As a static
  // it still leaves the message testable without a database.
  static describeNopolClashes(rows: { nopol: string; count: string }[]): string | null {
    if (rows.length === 0) return null
    const list = rows.map((r) => `${r.nopol} (${r.count} active rows)`).join(', ')
    return (
      'Cannot normalise fleet_vehicles.nopol: these plates become identical once spaces, dots ' +
      'and dashes are removed, and uq_fleet_vehicles_nopol_active allows only one active row ' +
      'per plate. Archive or correct the duplicates, then run the migration again. Colliding ' +
      'plates: ' +
      list
    )
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes: { nopol: string; count: string }[] = await queryRunner.query(`
      SELECT ${STRIPPED} AS nopol, count(*)::text AS count
      FROM fleet_vehicles
      WHERE is_active
      GROUP BY 1
      HAVING count(*) > 1
      ORDER BY 1
    `)
    const message = FleetNopolNormalize20260912000001.describeNopolClashes(clashes)
    if (message) throw new Error(message)

    await queryRunner.query(`
      UPDATE fleet_vehicles SET nopol = ${STRIPPED} WHERE nopol <> ${STRIPPED}
    `)
  }

  // Deliberately a no-op. The original spacing is recorded nowhere, so "B9114KYZ" cannot be put
  // back as "B 9114 KYZ" — and guessing where the spaces went would invent data. Reverting this
  // migration leaves the plates closed-up, which the old normalizer still accepts as valid input.
  public async down(): Promise<void> {}
}
