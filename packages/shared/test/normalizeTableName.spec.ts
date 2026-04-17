import { normalizeTableName } from '../src/normalizeTableName'

describe('normalizeTableName', () => {
  it('normalizes simple names', () => {
    expect(normalizeTableName('Delivery Routes')).toBe('air_shipment_delivery_routes')
  })

  it('removes diacritics and symbols', () => {
    expect(normalizeTableName('Café & Co.')).toBe('air_shipment_cafe_co')
  })

  it('prefixes numeric-starting names', () => {
    expect(normalizeTableName('123 Orders')).toBe('air_shipment_t_123_orders')
  })

  it('truncates to Postgres identifier limit', () => {
    const long = 'a'.repeat(200)
    const out = normalizeTableName(long)
    expect(out.length).toBeLessThanOrEqual(63)
  })
})
