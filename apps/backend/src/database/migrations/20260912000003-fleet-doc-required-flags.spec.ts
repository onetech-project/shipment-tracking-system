import { QueryRunner } from 'typeorm'
import { FleetDocRequiredFlags20260912000003 } from './20260912000003-fleet-doc-required-flags'

// The migration is the only place the per-code policy is written down, and it writes it as SQL
// rather than as data a unit test can read back. Driving up() through a recording runner is what
// puts the seven codes under test without needing a live database.
const runAndCapture = async (): Promise<string[]> => {
  const queries: string[] = []
  const runner = {
    query: async (sql: string) => {
      queries.push(sql)
      return []
    },
  } as unknown as QueryRunner
  await new FleetDocRequiredFlags20260912000003().up(runner)
  return queries
}

// Which branch a code lands in, read out of the statement that mentions it. Asserting only that
// the flag ends up non-null would pass just as happily with every code flipped to TRUE, which is
// exactly the mutation this spec exists to kill.
const flagFor = (queries: string[], code: string): boolean | null => {
  const stmt = queries.find((q) => q.includes(`'${code}'`))
  if (!stmt) return null
  return /is_required\s*=\s*TRUE/i.test(stmt)
}

describe('FleetDocRequiredFlags migration', () => {
  // The four papers a unit may not legally run without. A vehicle missing any of them is off the
  // road, which is why the form refuses to save one whose expiry date is blank.
  it.each(['stnk', 'pajak', 'asuransi', 'emisi'])('marks %s required', async (code) => {
    expect(flagFor(await runAndCapture(), code)).toBe(true)
  })

  // Kartu Pengawasan applies to public-transport units only, and KIR and servis are scheduled
  // rather than mandatory at registration. Marking any of them required would block every
  // ordinary unit from being saved at all.
  it.each(['kir', 'kartu_pengawasan', 'servis'])('leaves %s optional', async (code) => {
    expect(flagFor(await runAndCapture(), code)).toBe(false)
  })

  // Every seeded type must be classified. One left out keeps the NULL the seed migration wrote,
  // and NULL reads as "not required" — an unmarked type silently becomes optional forever.
  it('classifies all seven seeded document types', async () => {
    const queries = await runAndCapture()
    const codes = ['stnk', 'pajak', 'asuransi', 'emisi', 'kir', 'kartu_pengawasan', 'servis']
    expect(codes.filter((c) => flagFor(queries, c) === null)).toEqual([])
  })

  // Scoped to jenis_dokumen: jenis_berkas and jenis_sim carry the same column for their own
  // policy, and an unscoped UPDATE would overwrite both.
  it('touches only the jenis_dokumen category', async () => {
    for (const sql of await runAndCapture()) {
      expect(sql).toContain("category = 'jenis_dokumen'")
    }
  })
})
