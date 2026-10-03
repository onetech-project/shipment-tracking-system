import { fixtureSource } from './__fixtures__/source'
import { createState } from './state'
import { defaultScope, groupNames, resolveScope } from './scope'

const src = fixtureSource()
const s = createState(src)

it('names every group a route belongs to, or Tanpa Grup', () => {
  expect(groupNames(src, 'Jabo|Makassar')).toBe('Sulawesi & Timur, Prioritas')
  expect(groupNames(src, 'Jabo|Tanjung Pandan')).toBe('Tanpa Grup')
})

it('defaults to every group plus the ungrouped routes', () => {
  const scope = defaultScope(src, s)
  expect(scope.groups.size).toBe(5)
  expect([...scope.routes].sort()).toEqual(['Jabo|Tanjung Pandan', 'Jabo|Tanjung Pinang'])
})

it('lists a route once per group but once in the union, and flags it as a dupe', () => {
  const r = resolveScope(src, s, defaultScope(src, s))
  expect(r.dupes.has('Jabo|Makassar')).toBe(true)
  expect(r.union.filter((x) => x.key === 'Jabo|Makassar')).toHaveLength(1)
  expect(r.sections.at(-1)).toMatchObject({ id: 'picked', kind: 'routes' })
})

it('does not repeat a picked route that a ticked group already shows', () => {
  const r = resolveScope(src, s, { groups: new Set(['grp-prioritas']), routes: new Set(['Jabo|Makassar']) })
  expect(r.sections.map((x) => x.id)).toEqual(['grp-prioritas'])
})
