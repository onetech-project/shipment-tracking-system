import { FleetNopolNormalize20260912000001 } from './20260912000001-fleet-nopol-normalize'

const describeNopolClashes = FleetNopolNormalize20260912000001.describeNopolClashes

describe('describeNopolClashes', () => {
  it('returns null when nothing collides', () => {
    expect(describeNopolClashes([])).toBeNull()
  })

  // The plate is the only handle the operator has on the two rows they must reconcile. A message
  // that says "some plates collide" sends them hunting through the whole register by hand.
  it('names every colliding plate and how many active rows carry it', () => {
    const msg = describeNopolClashes([
      { nopol: 'B9114KYZ', count: '2' },
      { nopol: 'D1234AB', count: '3' },
    ])
    expect(msg).toContain('B9114KYZ (2 active rows)')
    expect(msg).toContain('D1234AB (3 active rows)')
  })

  // Without the instruction the operator is told what broke but not what to do about it, and the
  // deploy stalls on a message nobody can act on.
  it('says what to do about it', () => {
    const msg = describeNopolClashes([{ nopol: 'B9114KYZ', count: '2' }])
    expect(msg).toMatch(/archive or correct/i)
  })
})
