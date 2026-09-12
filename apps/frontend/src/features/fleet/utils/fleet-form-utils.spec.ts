import { normalizeNopolInput } from './nopol'
import { addMonths } from './date-offset'
import { docLabels } from './doc-labels'

describe('normalizeNopolInput', () => {
  // Requirement §1: separators are removed as the operator types, so the field shows exactly
  // what will be stored. Mirrors normalizeNopol on the backend — if the two disagree, the field
  // shows one plate and the register holds another.
  it.each([
    ['b 9114 kyz', 'B9114KYZ'],
    ['B.9114.KYZ', 'B9114KYZ'],
    ['B-9114-KYZ', 'B9114KYZ'],
    ['  b9114kyz  ', 'B9114KYZ'],
  ])('turns %s into %s', (raw, expected) => {
    expect(normalizeNopolInput(raw)).toBe(expected)
  })

  it('returns an empty string for separators alone', () => {
    expect(normalizeNopolInput(' - . ')).toBe('')
  })
})

describe('addMonths', () => {
  // Requirement §4: the KIR expiry pre-fills six months after the test date. This seeds an input
  // the operator may overwrite — it is not a status figure, which the backend still owns.
  it('adds whole months', () => {
    expect(addMonths('2026-03-10', 6)).toBe('2026-09-10')
  })

  it('rolls into the next year', () => {
    expect(addMonths('2026-10-10', 6)).toBe('2027-04-10')
  })

  // 31 August + 6 months is 28/29 February, which JS Date would silently roll to 2 or 3 March.
  // Clamping to the last day of the target month is what an operator means by "six months".
  it('clamps to the last day when the target month is shorter', () => {
    expect(addMonths('2025-08-31', 6)).toBe('2026-02-28')
  })

  it('clamps to 29 February in a leap year', () => {
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29')
  })

  it('returns an empty string for an empty date', () => {
    expect(addMonths('', 6)).toBe('')
  })

  it('returns an empty string for an unparseable date', () => {
    expect(addMonths('10 Maret', 6)).toBe('')
  })
})

describe('docLabels', () => {
  // Requirement #2: a service record has a last date and a next date, not an issue date and an
  // expiry. "Servis berkala terbit" reads as nonsense on the form.
  it('names the service dates for what they are', () => {
    expect(docLabels('servis', 'Servis Berkala')).toEqual({
      issued: 'Servis berkala terakhir',
      expires: 'Servis berkala berikutnya',
    })
  })

  it('names the KIR dates for what they are', () => {
    expect(docLabels('kir', 'KIR')).toEqual({
      issued: 'Tanggal uji KIR',
      expires: 'Masa berlaku KIR sampai',
    })
  })

  // An admin can add a document type from Master Data at any time. Falling back to the row's own
  // label keeps that type rendering sensibly without a code change.
  it('falls back to the master label for a type it does not know', () => {
    expect(docLabels('sertifikat_tera', 'Sertifikat Tera')).toEqual({
      issued: 'Sertifikat Tera terbit',
      expires: 'Sertifikat Tera berlaku sampai',
    })
  })
})
