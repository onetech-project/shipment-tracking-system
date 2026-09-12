import { computeLease, monthsBetween } from './fleet-lease'

describe('monthsBetween', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-01-10', '2026-04-10')).toBe(3)
  })

  // The day of month decides whether the month has actually elapsed. Counting it as whole would
  // bill the operator for an instalment a day before it is due.
  it('does not count a month that has not completed', () => {
    expect(monthsBetween('2026-01-10', '2026-04-09')).toBe(2)
  })

  it('counts a month that completed today', () => {
    expect(monthsBetween('2026-01-10', '2026-04-11')).toBe(3)
  })

  it('spans a year boundary', () => {
    expect(monthsBetween('2025-11-20', '2026-02-20')).toBe(3)
  })

  it('returns zero for the same day', () => {
    expect(monthsBetween('2026-01-10', '2026-01-10')).toBe(0)
  })

  // A start date in the future is a data-entry slip, not a negative instalment count.
  it('never goes negative', () => {
    expect(monthsBetween('2026-06-10', '2026-01-10')).toBe(0)
  })
})

describe('computeLease', () => {
  const base = {
    cicilanPerBulan: 8750000,
    tenorBulan: 36,
    angsuranMulai: '2026-01-10',
    angsuranTerbayarOverride: null,
  }

  // The instalment that falls on the start date is the first one paid, hence +1 — a contract
  // starting today has one instalment behind it, not zero.
  it('derives instalments paid from the start date, counting the first one', () => {
    expect(computeLease(base, '2026-04-10').angsuranTerbayar).toBe(4)
  })

  it('leaves the remaining count and value consistent with that', () => {
    const out = computeLease(base, '2026-04-10')
    expect(out.sisaAngsuran).toBe(32)
    expect(out.sisaKewajiban).toBe(32 * 8750000)
  })

  // A unit taken over mid-contract has a count that no longer matches its start date. The
  // override is the operator saying so, and it has to win.
  it('uses the override when one is given', () => {
    const out = computeLease({ ...base, angsuranTerbayarOverride: 12 }, '2026-04-10')
    expect(out.angsuranTerbayar).toBe(12)
    expect(out.sisaAngsuran).toBe(24)
  })

  it('treats an override of zero as a real answer, not as absent', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: 0 }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  // Both directions clamped: a mistyped override must not report a negative remainder, and a
  // long-finished contract must not keep accruing instalments past its tenor.
  it('clamps an override above the tenor', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: 99 }, '2026-04-10').angsuranTerbayar).toBe(36)
  })

  it('clamps a negative override to zero', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: -5 }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  it('clamps a derived count at the tenor once the contract has run out', () => {
    const out = computeLease(base, '2030-01-10')
    expect(out.angsuranTerbayar).toBe(36)
    expect(out.sisaAngsuran).toBe(0)
    expect(out.sisaKewajiban).toBe(0)
  })

  // A contract with no start date and no override is one nobody has filled in yet. Reporting
  // "36 instalments outstanding" would be a guess dressed up as a figure.
  it('reports nothing paid when there is no start date and no override', () => {
    expect(computeLease({ ...base, angsuranMulai: null }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  it('treats a missing tenor as nothing outstanding', () => {
    const out = computeLease({ ...base, tenorBulan: null }, '2026-04-10')
    expect(out.sisaAngsuran).toBe(0)
    expect(out.sisaKewajiban).toBe(0)
  })

  // tenor_bulan carries no CHECK constraint and no DTO bound, so a negative tenor reaches this
  // function intact. Reporting a negative remainder would subtract from the fleet's total debt.
  it('never reports a negative remainder when the tenor itself is corrupt', () => {
    const out = computeLease({ ...base, tenorBulan: -5 }, '2026-04-10')
    expect(out.sisaAngsuran).toBe(0)
    expect(out.sisaKewajiban).toBe(0)
  })

  it('treats a missing instalment amount as zero value outstanding', () => {
    const out = computeLease({ ...base, cicilanPerBulan: null }, '2026-04-10')
    expect(out.sisaAngsuran).toBe(32)
    expect(out.sisaKewajiban).toBe(0)
  })
})
