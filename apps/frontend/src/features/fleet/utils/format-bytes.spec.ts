import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('reports small files in KB', () => {
    expect(formatBytes(524288)).toBe('512 KB')
  })

  it('reports large files in MB with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB')
  })

  it('reports a tiny file in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('writes an em dash for a missing size', () => {
    expect(formatBytes(null)).toBe('—')
  })
})
