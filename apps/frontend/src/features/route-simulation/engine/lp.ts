// Maximise c·x subject to A x <= b, x >= 0, b >= 0. Dense simplex tableau with Bland's rule so a
// degenerate pivot cannot cycle. Problem size here is lanes (~60) x (lanes + routes + accounts),
// well inside what a dense tableau handles per keystroke.
export function solveLP(c: number[], A: number[][], b: number[]): { x: number[]; value: number } {
  const n = c.length
  const m = A.length
  const width = n + m
  if (!n) return { x: [], value: 0 }
  const T = A.map((row, i) => {
    const r = new Array<number>(width + 1).fill(0)
    for (let j = 0; j < n; j++) r[j] = row[j]
    r[n + i] = 1
    r[width] = b[i]
    return r
  })
  const z = new Array<number>(width + 1).fill(0)
  for (let j = 0; j < n; j++) z[j] = -c[j]
  const basis = T.map((_, i) => n + i)
  const EPS = 1e-9
  for (let iter = 0; iter < 50000; iter++) {
    let enter = -1
    for (let j = 0; j < width; j++) if (z[j] < -EPS) { enter = j; break }
    if (enter < 0) break
    let leave = -1
    let best = Infinity
    for (let i = 0; i < m; i++) {
      if (T[i][enter] <= EPS) continue
      const q = T[i][width] / T[i][enter]
      if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && basis[i] < basis[leave])) { best = q; leave = i }
    }
    if (leave < 0) break
    const pivot = T[leave][enter]
    for (let j = 0; j <= width; j++) T[leave][j] /= pivot
    for (let i = 0; i < m; i++) {
      const f = T[i][enter]
      if (i === leave || Math.abs(f) < 1e-12) continue
      for (let j = 0; j <= width; j++) T[i][j] -= f * T[leave][j]
    }
    const f = z[enter]
    for (let j = 0; j <= width; j++) z[j] -= f * T[leave][j]
    basis[leave] = enter
  }
  const x = new Array<number>(n).fill(0)
  basis.forEach((v, i) => { if (v < n) x[v] = Math.max(0, T[i][width]) })
  return { x, value: z[width] }
}
