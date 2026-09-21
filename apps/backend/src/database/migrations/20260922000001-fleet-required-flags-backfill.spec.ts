import { QueryRunner } from 'typeorm'
import { FleetRequiredFlagsBackfill20260922000001 } from './20260922000001-fleet-required-flags-backfill'

// Same recording-runner trick the 20260912000003 spec uses: the policy lives in SQL, so the SQL
// is what gets asserted. No database is involved.
const capture = async (dir: 'up' | 'down'): Promise<string[]> => {
  const queries: string[] = []
  const runner = {
    query: async (sql: string) => {
      queries.push(sql)
      return []
    },
  } as unknown as QueryRunner
  const migration = new FleetRequiredFlagsBackfill20260922000001()
  await (dir === 'up' ? migration.up(runner) : migration.down(runner))
  return queries
}

describe('FleetRequiredFlagsBackfill migration', () => {
  // FALSE, never TRUE. Backfilling TRUE would mark every unclassified file type mandatory and
  // turn the completeness chip red across the whole fleet in one deploy.
  it('writes FALSE', async () => {
    const [sql] = await capture('up')
    expect(sql).toMatch(/is_required\s*=\s*FALSE/i)
    expect(sql).not.toMatch(/is_required\s*=\s*TRUE/i)
  })

  // Rows already classified by 20260912000003 carry a deliberate TRUE/FALSE. Overwriting them
  // would silently undo that migration's policy.
  it('touches only the rows that are still NULL', async () => {
    const [sql] = await capture('up')
    expect(sql).toMatch(/is_required\s+IS\s+NULL/i)
  })

  // The other six categories never read is_required. Writing FALSE there would claim a policy
  // that does not exist for them.
  it('is scoped to the two categories that read the flag', async () => {
    const [sql] = await capture('up')
    expect(sql).toContain("'jenis_berkas'")
    expect(sql).toContain("'jenis_dokumen'")
    for (const other of ['pool', 'leasing', 'kepemilikan', 'jenis_armada', 'status_kendaraan', 'jenis_sim']) {
      expect(sql).not.toContain(`'${other}'`)
    }
  })

  it('restores NULL on the same two categories when rolled back', async () => {
    const [sql] = await capture('down')
    expect(sql).toMatch(/is_required\s*=\s*NULL/i)
    expect(sql).toContain("'jenis_berkas'")
    expect(sql).toContain("'jenis_dokumen'")
  })
})
