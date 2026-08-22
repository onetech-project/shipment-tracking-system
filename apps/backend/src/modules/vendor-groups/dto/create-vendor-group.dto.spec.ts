/**
 * Pins the decorator set on CreateVendorGroupDto. Vendors are bare strings, so the rules are
 * per-element (`{ each: true }`) rather than @ValidateNested + @Type — that pair exists on the
 * route-group DTO only because a route member is an object, and copying it here would make
 * class-transformer try to instantiate a class from a string.
 */
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateVendorGroupDto } from './create-vendor-group.dto'

const constraintsFor = (payload: unknown, property: string): Record<string, string> => {
  const errors = validateSync(plainToInstance(CreateVendorGroupDto, payload))
  return errors.find((e) => e.property === property)?.constraints ?? {}
}

it('accepts a payload whose vendors are plain non-empty strings', () => {
  const errors = validateSync(
    plainToInstance(CreateVendorGroupDto, {
      name: 'Maskapai Nasional',
      description: 'vendor pelat merah',
      vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
    }),
  )

  expect(errors).toEqual([])
})

it('rejects an empty vendors array', () => {
  expect(constraintsFor({ name: 'X', vendors: [] }, 'vendors')).toHaveProperty('arrayMinSize')
})

it('rejects an empty string inside vendors', () => {
  expect(constraintsFor({ name: 'X', vendors: ['GARUDA', ''] }, 'vendors')).toHaveProperty(
    'isNotEmpty',
  )
})

it('rejects a vendor name longer than the 200-character column', () => {
  expect(constraintsFor({ name: 'X', vendors: ['A'.repeat(201)] }, 'vendors')).toHaveProperty(
    'maxLength',
  )
})

// A route-group-shaped member is the exact mistake this DTO exists to prevent.
it('rejects an object where a vendor string is expected', () => {
  expect(
    constraintsFor({ name: 'X', vendors: [{ origin: 'Jabo', dest: 'Aceh' }] }, 'vendors'),
  ).toHaveProperty('isString')
})

// Decision #7. The DTO must not be a normalisation point: whatever the picker sends is what gets
// stored, because that is what v_pnl_to.vendor is going to be compared against.
it('leaves surrounding whitespace and casing on a vendor name untouched', () => {
  const dto = plainToInstance(CreateVendorGroupDto, {
    name: 'X',
    vendors: ['  garuda Indonesia '],
  })

  expect(validateSync(dto)).toEqual([])
  expect(dto.vendors).toEqual(['  garuda Indonesia '])
})

it('rejects a name longer than the 100-character column', () => {
  expect(constraintsFor({ name: 'A'.repeat(101), vendors: ['GARUDA'] }, 'name')).toHaveProperty(
    'maxLength',
  )
})
