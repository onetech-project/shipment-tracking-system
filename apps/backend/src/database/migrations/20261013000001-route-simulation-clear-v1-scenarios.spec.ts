import { QueryRunner } from 'typeorm'
import { RouteSimulationClearV1Scenarios20261013000001 } from './20261013000001-route-simulation-clear-v1-scenarios'

// Recording runner, as in the 20260922000001 spec: the policy is the SQL, so the SQL is asserted.
const capture = async (dir: 'up' | 'down'): Promise<string[]> => {
  const queries: string[] = []
  const runner = {
    query: async (sql: string) => {
      queries.push(sql)
      return []
    },
  } as unknown as QueryRunner
  const migration = new RouteSimulationClearV1Scenarios20261013000001()
  await (dir === 'up' ? migration.up(runner) : migration.down(runner))
  return queries
}

describe('RouteSimulationClearV1Scenarios migration', () => {
  // The v2 engine cannot read a v1 payload (cost basis, no simulation range). The page is not live,
  // so the rows are dropped rather than migrated.
  it('deletes every scenario that is not payload version 2', async () => {
    const [sql, ...rest] = await capture('up')
    expect(rest).toEqual([])
    expect(sql).toMatch(/DELETE FROM route_simulation_scenarios/i)
    expect(sql).toMatch(/payload->>'version'\)\s+IS DISTINCT FROM\s+'2'/i)
  })

  it('cannot restore deleted rows, so down does nothing', async () => {
    expect(await capture('down')).toEqual([])
  })
})
