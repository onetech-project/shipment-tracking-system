import { buildLogFilename } from './app-logger.service'

describe('buildLogFilename', () => {
  // Local-component Date so getFullYear/getMonth/getDate are deterministic regardless of TZ.
  const time = new Date(2026, 5, 23, 10, 0, 0) // 2026-06-23 10:00 local

  it('returns the active (un-rotated) file name when time is null', () => {
    expect(buildLogFilename(null)).toBe('app.log')
  })

  it('produces a UNIQUE name for each rotation index (the RFS-TOO-MANY bug)', () => {
    // rotating-file-stream calls the generator with index 1..999 in findName() and needs
    // distinct names to find a free rotation target. Same name for every index => RFS-TOO-MANY.
    expect(buildLogFilename(time, 1)).not.toBe(buildLogFilename(time, 2))
    expect(buildLogFilename(time, 2)).not.toBe(buildLogFilename(time, 3))
  })

  it('encodes the date and a zero-padded index, ending in .log.gz (LogArchiveService match)', () => {
    expect(buildLogFilename(time, 1)).toBe('app-2026-06-23-01.log.gz')
    expect(buildLogFilename(time, 2)).toBe('app-2026-06-23-02.log.gz')
  })

  it('rotated names match the monthly archive filter (startsWith app-YYYY-MM- && endsWith .log.gz)', () => {
    const name = buildLogFilename(time, 1)
    expect(name.startsWith('app-2026-06-')).toBe(true)
    expect(name.endsWith('.log.gz')).toBe(true)
  })
})
