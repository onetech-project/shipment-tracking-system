import { fmtIdr, fmtPct, fmtShort, toneClass } from './format'

it('formats like the prototype', () => {
  expect(fmtShort(1_200_000_000)).toBe('1,2 M')
  expect(fmtShort(800_000)).toBe('800.000')
  expect(fmtShort(15_500_000)).toBe('15,5 jt')
  expect(fmtPct(0.1234)).toBe('12,3%')
  expect(fmtIdr(-1500)).toBe('-Rp 1.500')
})

it('colours a zero tone neutral, not green', () => {
  expect(toneClass(-1)).toBe('text-bad')
  expect(toneClass(1)).toBe('text-good')
  expect(toneClass(0)).toBe('text-foreground')
})
