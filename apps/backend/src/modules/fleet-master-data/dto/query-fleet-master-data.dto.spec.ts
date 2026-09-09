/**
 * The includeInactive transform is the only thing keeping a deactivated row out of the dropdowns.
 * Deactivating is the spec's designated alternative to deletion — the answer the 409 points an
 * admin at — so a transform that defaults to true would hand back the very rows an admin
 * deactivated to stop them being offered, on every request that omits the parameter. That includes
 * useFleetMasterDataByCategory, which feeds the driver form's jenis_sim dropdown and never sends
 * the flag at all.
 *
 * plainToInstance is used rather than a hand-built object because the transform only runs through
 * class-transformer, which is how ValidationPipe drives it in main.ts.
 */
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { QueryFleetMasterDataDto } from './query-fleet-master-data.dto'

const build = (raw: Record<string, unknown> = {}) => plainToInstance(QueryFleetMasterDataDto, raw)

describe('QueryFleetMasterDataDto', () => {
  describe('includeInactive', () => {
    // Query strings arrive as text, so 'false' is a truthy string and the naive check is the bug
    // this transform exists to prevent.
    it("treats the string 'true' as true", () => {
      expect(build({ includeInactive: 'true' }).includeInactive).toBe(true)
    })

    it("treats the string 'false' as false, not as a truthy string", () => {
      expect(build({ includeInactive: 'false' }).includeInactive).toBe(false)
    })

    it('accepts a real boolean true unchanged', () => {
      expect(build({ includeInactive: true }).includeInactive).toBe(true)
    })

    it('accepts a real boolean false unchanged', () => {
      expect(build({ includeInactive: false }).includeInactive).toBe(false)
    })

    // class-transformer does not invoke @Transform for a key the payload never had, so an omitted
    // parameter stays undefined rather than being transformed to false — the service's own
    // `includeInactive = false` default is what makes the omission mean "active rows only". Pinned
    // as undefined rather than false because that is what the DTO actually produces; asserting
    // false here would pass only by accident and would start lying the moment the transform's
    // handling of absent keys changed.
    it('leaves an omitted parameter undefined for the service default to handle', () => {
      const dto = build({})
      expect(dto.includeInactive).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(dto, 'includeInactive')).toBe(false)
    })

    // The load-bearing case for the `value !== 'false'` mutation, which passes the 'true'/'false'
    // pair above and fails only here: under it every value that is not literally 'false' — a typo,
    // an empty string, a stray '0' — becomes true and the response starts carrying deactivated
    // rows into the dropdowns those rows were deactivated to stay out of.
    it.each(['yes', '1', 'TRUE', 'True', 'on', ''])(
      'treats the arbitrary string %p as false',
      (raw) => {
        expect(build({ includeInactive: raw }).includeInactive).toBe(false)
      },
    )

    // The transform always yields a boolean, so @IsBoolean can never fail — asserting validation
    // passes for the string form is what proves the transform runs before the validator rather
    // than the query being rejected as a 400 before it reaches the service.
    it('validates cleanly once transformed from a query string', async () => {
      expect(await validate(build({ includeInactive: 'false' }))).toHaveLength(0)
    })
  })

  describe('category', () => {
    it('accepts a category from the known eight', async () => {
      expect(await validate(build({ category: 'jenis_sim' }))).toHaveLength(0)
    })

    // Without @IsIn an unknown category reaches the repository as a where-clause that matches
    // nothing, and the screen reads as an empty category rather than a bad request.
    it('rejects a category outside the known eight', async () => {
      const errors = await validate(build({ category: 'warna_favorit' }))
      expect(errors.map((e) => e.property)).toContain('category')
    })

    // Both fields are optional: an unfiltered list of every active row is a legitimate request.
    it('accepts a query with no parameters at all', async () => {
      expect(await validate(build())).toHaveLength(0)
    })
  })
})
