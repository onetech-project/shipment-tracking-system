import { solveLP } from './lp'

it('solves the textbook max 3x+5y, x<=4, 2y<=12, 3x+2y<=18', () => {
  const { x, value } = solveLP([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18])
  expect(x[0]).toBeCloseTo(2)
  expect(x[1]).toBeCloseTo(6)
  expect(value).toBeCloseTo(36)
})

it('returns zeros for an empty problem and for zero capacity', () => {
  expect(solveLP([], [], [])).toEqual({ x: [], value: 0 })
  expect(solveLP([1], [[1]], [0]).x).toEqual([0])
})

it('terminates on a degenerate problem (Bland rule)', () => {
  const { value } = solveLP([10, -57, -9, -24], [[0.5, -5.5, -2.5, 9], [0.5, -1.5, -0.5, 1], [1, 0, 0, 0]], [0, 0, 1])
  expect(value).toBeCloseTo(1)
})
