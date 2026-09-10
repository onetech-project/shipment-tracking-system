import { daysUntil, severityFor, todayISO, worstSeverity } from './fleet-severity'

describe('todayISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // The whole point of this function is the zone. A UTC implementation passes the shape test
  // above and is still wrong for seven hours of every Jakarta day, so pin the zone directly:
  // 17:30 UTC is already the next day in WIB (UTC+7).
  it('uses the Jakarta day, not the UTC day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T17:30:00Z'))
    try {
      expect(todayISO()).toBe('2026-09-11')
    } finally {
      jest.useRealTimers()
    }
  })

  it('agrees with UTC when the two zones are on the same day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T03:00:00Z'))
    try {
      expect(todayISO()).toBe('2026-09-10')
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-09-20', '2026-09-10')).toBe(10)
  })

  it('returns zero on the expiry date itself', () => {
    expect(daysUntil('2026-09-10', '2026-09-10')).toBe(0)
  })

  it('goes negative once the date has passed', () => {
    expect(daysUntil('2026-09-03', '2026-09-10')).toBe(-7)
  })

  it('returns null for a document with no expiry date', () => {
    expect(daysUntil(null, '2026-09-10')).toBeNull()
  })

  // Both endpoints are parsed as UTC midnight, so a month boundary and a DST shift in the
  // server's local zone cannot round the difference to 9 or 11 days.
  it('crosses a month boundary exactly', () => {
    expect(daysUntil('2026-10-01', '2026-09-30')).toBe(1)
  })

  // An unparseable date must come back as null, not NaN. NaN silently poisons every downstream
  // comparison — severityFor(NaN) falls through to 'ok', so a garbage expiry date would render
  // as a green badge instead of surfacing as undated.
  it('returns null rather than NaN for an unparseable expiry date', () => {
    expect(daysUntil('not-a-date', '2026-09-10')).toBeNull()
  })

  it('returns null rather than NaN when the reference day is unparseable', () => {
    expect(daysUntil('2026-09-20', 'garbage')).toBeNull()
  })
})

describe('severityFor', () => {
  it('marks a past date critical', () => {
    expect(severityFor(-1, 30)).toBe('crit')
  })

  // The view reads WHEN expires_at < today THEN 0, so a document expiring TODAY is still rank 1
  // (warn), not crit — it is valid for the rest of the business day. Verified against the live
  // fleet_vehicle_document_status: daysLeft 0 yields severity_rank 1, daysLeft -1 yields 0.
  it('marks the expiry day itself warn, not critical', () => {
    expect(severityFor(0, 30)).toBe('warn')
  })

  // The boundary the spec calls out: warnDays is inclusive, so exactly warnDays away is amber,
  // and one day further out is green.
  it('warns exactly on the warnDays boundary', () => {
    expect(severityFor(30, 30)).toBe('warn')
  })

  it('is ok one day beyond the boundary', () => {
    expect(severityFor(31, 30)).toBe('ok')
  })

  it('honours a per-type threshold shorter than the default', () => {
    expect(severityFor(20, 14)).toBe('ok')
    expect(severityFor(14, 14)).toBe('warn')
  })

  // A document type whose warn_days was never set falls back to 30 — the same constant the
  // status view's COALESCE uses. If the two drift the list and the filter disagree.
  it('falls back to 30 days when the type has no threshold', () => {
    expect(severityFor(30, null)).toBe('warn')
    expect(severityFor(31, null)).toBe('ok')
  })

  it('reports a document with no expiry date as none', () => {
    expect(severityFor(null, 30)).toBe('none')
  })
})

describe('worstSeverity', () => {
  it('picks crit over everything', () => {
    expect(worstSeverity(['ok', 'crit', 'warn'])).toBe('crit')
  })

  it('picks warn over ok', () => {
    expect(worstSeverity(['ok', 'warn', 'ok'])).toBe('warn')
  })

  // A vehicle with no dated documents is not "fine", it is "unknown" — the list shows a dash
  // rather than a green badge, and the ?severity=none filter is what finds these.
  it('reports none for a vehicle with no dated documents', () => {
    expect(worstSeverity([])).toBe('none')
    expect(worstSeverity(['none', 'none'])).toBe('none')
  })

  // 'ok' must beat 'none': one dated healthy document means the vehicle is not unknown.
  it('prefers ok over none when at least one document is dated', () => {
    expect(worstSeverity(['none', 'ok'])).toBe('ok')
  })
})
