import { act, renderHook } from '@testing-library/react'
import { useVehicleForm } from './useVehicleForm'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'jenis_dokumen',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 0,
  isActive: true,
  warnDays: 30,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const docTypes: FleetMasterRow[] = [
  master({ id: 'dt-stnk', code: 'stnk', label: 'STNK', isRequired: true }),
  master({ id: 'dt-kir', code: 'kir', label: 'KIR', isRequired: false, defaultValidMonths: 6 }),
  master({ id: 'dt-pajak', code: 'pajak', label: 'Pajak', isRequired: true, defaultValidMonths: 12 }),
]

const kepemilikan: FleetMasterRow[] = [
  master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
  master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
]

// The real codes seeded in fleet_master_data for category 'leasing'. 'lunas' and
// 'tanpa_leasing' are not financiers: a unit pointed at either has no contract to describe.
const leasing: FleetMasterRow[] = [
  master({ id: 'ls1', category: 'leasing', code: 'mtf', label: 'MTF' }),
  master({ id: 'ls-lunas', category: 'leasing', code: 'lunas', label: 'Lunas' }),
  master({ id: 'ls-tanpa', category: 'leasing', code: 'tanpa_leasing', label: 'Tanpa leasing' }),
]

const drivers: FleetDriver[] = [
  {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    telepon: null,
    simNomor: '3201-1122-3344',
    simJenisId: null,
    simExpiresAt: '2027-03-14',
    isActive: true,
  },
]

const setup = (initial?: FleetVehicle) =>
  renderHook(() => useVehicleForm({ initial, docTypes, kepemilikan, leasing, drivers }))

// Every field filled, so each test empties exactly one and sees only that error.
const fillValid = (api: { current: ReturnType<typeof useVehicleForm> }) =>
  act(() => {
    api.current.setValue('nopol', 'B9114KYZ')
    api.current.setValue('merk', 'Mitsubishi')
    api.current.setValue('tipe', 'Canter FE 74 HD')
    api.current.setValue('jenisArmadaId', 'ja1')
    api.current.setValue('tahun', '2021')
    api.current.setValue('kapasitas', '8 ton')
    api.current.setValue('noRangka', 'MHMFE74P5MK000111')
    api.current.setValue('noMesin', '4D34T-000111')
    api.current.setValue('noBpkb', 'M-01234567')
    api.current.setValue('kepemilikanId', 'kp-esp')
    api.current.setValue('leasingId', 'ls1')
    api.current.setValue('nomorKontrak', 'MTF-2024-03-11872')
    api.current.setValue('cicilanPerBulan', '8750000')
    api.current.setValue('tenorBulan', '36')
    api.current.setValue('angsuranMulai', '2026-01-10')
    api.current.setValue('poolId', 'p1')
    api.current.setDocField('dt-stnk', 'expiresAt', '2031-01-10')
    api.current.setDocField('dt-pajak', 'expiresAt', '2027-01-10')
  })

describe('useVehicleForm', () => {
  it('starts empty when adding a vehicle', () => {
    const { result } = setup()
    expect(result.current.values.nopol).toBe('')
    expect(result.current.values.cicilanPerBulan).toBe('')
    expect(result.current.docRow('dt-stnk')).toEqual({ nomor: '', issuedAt: '', expiresAt: '' })
  })

  // Requirement §1: the separators go as the operator types, so the field shows exactly what is
  // stored. Typed anywhere else the plate would be normalised only on submit, and the duplicate
  // warning would name a plate the operator never saw.
  it('strips separators from the plate as it is typed', () => {
    const { result } = setup()
    act(() => result.current.setValue('nopol', 'b 9114-kyz'))
    expect(result.current.values.nopol).toBe('B9114KYZ')
  })

  it('leaves every other field exactly as typed', () => {
    const { result } = setup()
    act(() => result.current.setValue('tipe', 'Canter FE 74 HD'))
    expect(result.current.values.tipe).toBe('Canter FE 74 HD')
  })

  // Spec §6.1: the expiry fills from the master row's default_valid_months. KIR is the six months
  // requirement §4 asks for, and it arrives from master data rather than from a constant here.
  it('fills the expiry from the document type default when the issue date is entered', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('2026-09-10')
  })

  // "Hanya mengisi kolom yang masih kosong" — an operator who already typed the real expiry off
  // the document must not have it overwritten by an arithmetic guess.
  it('leaves an expiry the operator already typed alone', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'expiresAt', '2026-12-31'))
    act(() => result.current.setDocField('dt-kir', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('2026-12-31')
  })

  it('fills nothing for a type with no default validity', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-stnk', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-stnk').expiresAt).toBe('')
  })

  // Clearing the issue date must not leave a derived expiry behind claiming to know something.
  it('does not derive an expiry from a cleared issue date', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'issuedAt', ''))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('')
  })

  // Spec §6: one source of truth for the licence. The form reads it off the chosen driver rather
  // than storing a copy, so a renewal in the Sopir module reaches every unit at once.
  it('exposes the chosen driver so the SIM fields can read from it', () => {
    const { result } = setup()
    act(() => result.current.setValue('driverId', 'dr1'))
    expect(result.current.driver).toMatchObject({
      simNomor: '3201-1122-3344',
      simExpiresAt: '2027-03-14',
    })
  })

  it('reports no driver when none is chosen', () => {
    const { result } = setup()
    expect(result.current.driver).toBeNull()
  })

  it('accepts a fully filled form', () => {
    const { result } = setup()
    fillValid(result)
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
    expect(result.current.errors).toEqual({})
  })

  // Spec §5.1 lists these by name. Asserted one at a time, each against its own key: a validator
  // that writes every message to a single form-level string passes a "shows an error" test while
  // leaving the operator to hunt for which of 22 fields it means.
  it.each([
    ['nopol', 'nomor polisi'],
    ['merk', 'merk'],
    ['tipe', 'tipe'],
    ['jenisArmadaId', 'jenis armada'],
    ['tahun', 'tahun'],
    ['kapasitas', 'kapasitas'],
    ['noRangka', 'nomor rangka'],
    ['noMesin', 'nomor mesin'],
    ['noBpkb', 'nomor bpkb'],
    ['poolId', 'pool'],
    ['kepemilikanId', 'status kepemilikan'],
    ['leasingId', 'perusahaan leasing'],
    ['nomorKontrak', 'nomor kontrak'],
    ['cicilanPerBulan', 'cicilan'],
    ['tenorBulan', 'total angsuran'],
    ['angsuranMulai', 'tanggal angsuran pertama'],
  ])('refuses a form with no %s', (field, wording) => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue(field as keyof typeof result.current.values, '')
      result.current.validate()
    })
    expect(result.current.errors[field]?.toLowerCase()).toContain(wording)
  })

  // Requirement §2 marks this the one optional lease field: blank means the backend derives the
  // count from the start date (spec §5.2).
  it('accepts a form with no angsuranTerbayar', () => {
    const { result } = setup()
    fillValid(result)
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
    expect(result.current.errors.angsuranTerbayar).toBeUndefined()
  })

  // A unit bought outright has no financier to name a contract with. Master data offers "Lunas"
  // and "Tanpa leasing" for exactly that, so demanding a contract number behind them would make a
  // cash-bought truck impossible to register at all. Matched by code, because ids differ per
  // environment while the seeded code does not.
  it.each([
    ['ls-lunas', 'lunas'],
    ['ls-tanpa', 'tanpa_leasing'],
  ])('accepts a unit with no financing when leasing is %s', (leasingId) => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('leasingId', leasingId)
      result.current.setValue('nomorKontrak', '')
      result.current.setValue('cicilanPerBulan', '')
      result.current.setValue('tenorBulan', '')
      result.current.setValue('angsuranMulai', '')
    })
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
    expect(result.current.errors).toEqual({})
  })

  // The escape hatch is narrow: a real financier still has to be described in full, or the
  // register holds a truck under contract whose instalments nobody can compute.
  it.each(['nomorKontrak', 'cicilanPerBulan', 'tenorBulan', 'angsuranMulai'])(
    'still demands %s when a real financier is chosen',
    (field) => {
      const { result } = setup()
      fillValid(result)
      act(() => {
        result.current.setValue(field as keyof typeof result.current.values, '')
        result.current.validate()
      })
      expect(result.current.errors[field]).toBeTruthy()
    },
  )

  // Choosing the financier itself is never optional: blank means the operator has not answered
  // the question, which is different from answering "none".
  it('still demands the leasing choice for an unfinanced unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('leasingId', '')
      result.current.setValue('nomorKontrak', '')
      result.current.validate()
    })
    expect(result.current.errors.leasingId).toBeTruthy()
  })

  // The backend reads an explicit null as "close any open contract and open no replacement".
  // An object of empty strings would instead open a contract with no figures in it.
  it.each(['ls-lunas', 'ls-tanpa'])('sends a null lease when leasing is %s', (leasingId) => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('leasingId', leasingId)
      result.current.setValue('nomorKontrak', '')
      result.current.setValue('cicilanPerBulan', '')
      result.current.setValue('tenorBulan', '')
      result.current.setValue('angsuranMulai', '')
    })
    expect(result.current.buildPayload().lease).toBeNull()
  })

  // The kepemilikanId still travels: an unfinanced unit is not an unowned one.
  it('keeps the rest of the payload intact for an unfinanced unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.setValue('leasingId', 'ls-lunas'))
    const payload = result.current.buildPayload()
    expect(payload.nopol).toBe('B9114KYZ')
    expect(payload.kepemilikanId).toBe('kp-esp')
  })

  // A leasingId the master list does not know is not an escape hatch — while the list is still
  // loading every id is unknown, and treating that as "no financing" would silently drop a real
  // contract the operator had just typed.
  it('treats an unrecognised leasing id as financed', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('leasingId', 'ls-not-in-master')
      result.current.setValue('nomorKontrak', '')
      result.current.validate()
    })
    expect(result.current.errors.nomorKontrak).toBeTruthy()
    expect(result.current.buildPayload().lease).not.toBeNull()
  })

  // Spec §5.1 bersyarat. A rented truck belongs to somebody outside the company, and a register
  // that cannot say who has lost the only fact that matters when the contract ends.
  it('demands the owner name for a sewa lepas kunci unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('kepemilikanId', 'kp-sewa')
      result.current.validate()
    })
    expect(result.current.errors.pemilikUnit).toBeTruthy()
  })

  it('accepts a sewa lepas kunci unit once the owner is named', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('kepemilikanId', 'kp-sewa')
      result.current.setValue('pemilikUnit', 'PT Sumber Jaya')
    })
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
  })

  it('does not demand an owner name for a company-owned unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors.pemilikUnit).toBeUndefined()
  })

  // Spec §4.2 puts the mandatory list in master data, and what the warning system actually reads
  // is the expiry — a document number with no date warns nobody.
  it('demands an expiry for every document flagged required', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setDocField('dt-stnk', 'expiresAt', '')
      result.current.validate()
    })
    expect(result.current.errors['doc-dt-stnk']).toBeTruthy()
  })

  it('does not demand an expiry for an optional document', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors['doc-dt-kir']).toBeUndefined()
  })

  it('clears an error once the field is filled in', () => {
    const { result } = setup()
    act(() => result.current.validate())
    expect(result.current.errors.merk).toBeTruthy()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors.merk).toBeUndefined()
  })

  // One distinct value per field, asserted as a whole object. Identical placeholders would let a
  // field cross-wired to its neighbour's key — the defect a 22-field form actually produces —
  // pass while writing the wrong column.
  it('builds a payload with every field under its own key', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('pemilikUnit', 'PT Sumber Jaya')
      result.current.setValue('driverId', 'dr1')
      result.current.setValue('statusId', 's1')
      result.current.setValue('odometer', '120000')
      result.current.setValue('catatan', 'Servis rutin')
      result.current.setValue('angsuranTerbayar', '4')
    })
    expect(result.current.buildPayload()).toEqual({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter FE 74 HD',
      tahun: 2021,
      kapasitas: '8 ton',
      noRangka: 'MHMFE74P5MK000111',
      noMesin: '4D34T-000111',
      noBpkb: 'M-01234567',
      pemilikUnit: 'PT Sumber Jaya',
      odometer: 120000,
      catatan: 'Servis rutin',
      jenisArmadaId: 'ja1',
      kepemilikanId: 'kp-esp',
      poolId: 'p1',
      statusId: 's1',
      driverId: 'dr1',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-2024-03-11872',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: 4,
      },
      documents: [
        { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
        { docTypeId: 'dt-pajak', nomor: null, issuedAt: null, expiresAt: '2027-01-10' },
      ],
    })
  })

  // A blank number input reads as ''. Number('') is 0, which would register a zero odometer on a
  // used truck and a 1970 model year — both plausible enough to go unnoticed.
  it('sends null rather than zero for a blank odometer', () => {
    const { result } = setup()
    fillValid(result)
    expect(result.current.buildPayload().odometer).toBeNull()
  })

  it('sends a null angsuranTerbayar when the operator leaves it blank', () => {
    const { result } = setup()
    fillValid(result)
    expect(result.current.buildPayload().lease?.angsuranTerbayar).toBeNull()
  })

  // Trimmed, because ' B9114KYZ ' is a different string to the unique index and would register
  // the same truck twice.
  it('trims the free text it sends', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.setValue('merk', '  Hino  '))
    expect(result.current.buildPayload().merk).toBe('Hino')
  })

  it('sends null rather than an empty string for untouched optional text', () => {
    const { result } = setup()
    fillValid(result)
    const payload = result.current.buildPayload()
    expect(payload.catatan).toBeNull()
    expect(payload.pemilikUnit).toBeNull()
    expect(payload.statusId).toBeNull()
  })

  // An untouched row is not a document. Sent anyway it would create a live row with no data,
  // which the warning system then reports as a document with no expiry.
  it('leaves empty document rows out of the payload', () => {
    const { result } = setup()
    fillValid(result)
    // A row the operator opened and then cleared again exists in state but holds nothing. Sent
    // anyway it would create a live document with no dates, which the warning system then
    // reports as a document about to expire.
    act(() => result.current.setDocField('dt-kir', 'nomor', 'KIR-1'))
    act(() => result.current.setDocField('dt-kir', 'nomor', '   '))
    expect(result.current.buildPayload().documents?.map((d) => d.docTypeId)).toEqual([
      'dt-stnk',
      'dt-pajak',
    ])
  })

  // Each of the three fields on its own is enough to make the row real: an operator who wrote
  // only the document number has still told the register something.
  it.each(['nomor', 'issuedAt', 'expiresAt'] as const)(
    'keeps a document row that carries only its %s',
    (field) => {
      const { result } = setup()
      fillValid(result)
      act(() => result.current.setDocField('dt-kir', field, field === 'nomor' ? 'KIR-1' : '2026-03-10'))
      expect(result.current.buildPayload().documents?.map((d) => d.docTypeId)).toContain('dt-kir')
    },
  )

  describe('editing an existing vehicle', () => {
    const existing = {
      id: 'v1',
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter',
      tahun: 2021,
      kapasitas: '8 ton',
      noRangka: 'MHM111',
      noMesin: '4D34-1',
      noBpkb: 'M-01',
      pemilikUnit: 'PT Sumber Jaya',
      odometer: 120000,
      catatan: 'Servis rutin',
      jenisArmada: { id: 'ja1', label: 'CDE' },
      kepemilikan: { id: 'kp-esp', label: 'Milik ESP' },
      pool: { id: 'p1', label: 'Pool Cakung' },
      status: { id: 's1', label: 'Beroperasi' },
      driver: { id: 'dr1', nama: 'Ahmad Fauzi', simExpiresAt: '2027-03-14', simDaysLeft: 550, simSeverity: 'ok' },
      lease: {
        id: 'lc1',
        leasing: { id: 'ls1', label: 'MTF' },
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: null,
        angsuranTerbayar: 9,
        sisaAngsuran: 27,
        sisaKewajiban: 236250000,
      },
      documents: [
        {
          docTypeId: 'dt-stnk',
          code: 'stnk',
          label: 'STNK',
          nomor: 'STNK-1',
          issuedAt: '2026-01-10',
          expiresAt: '2031-01-10',
          daysLeft: 1000,
          severity: 'ok',
        },
      ],
      worstSeverity: 'ok',
      minDaysLeft: 1000,
      isActive: true,
    } as FleetVehicle

    // The refs arrive as {id,label} objects and the selects need the bare id. A mismatch here
    // resets the dropdown to blank on every edit and quietly clears the column on save.
    it('prefills every field from the vehicle', () => {
      const { result } = setup(existing)
      expect(result.current.values).toMatchObject({
        nopol: 'B9114KYZ',
        merk: 'Mitsubishi',
        tipe: 'Canter',
        tahun: '2021',
        kapasitas: '8 ton',
        noRangka: 'MHM111',
        noMesin: '4D34-1',
        noBpkb: 'M-01',
        pemilikUnit: 'PT Sumber Jaya',
        odometer: '120000',
        catatan: 'Servis rutin',
        jenisArmadaId: 'ja1',
        kepemilikanId: 'kp-esp',
        poolId: 'p1',
        statusId: 's1',
        driverId: 'dr1',
      })
    })

    it('prefills the lease from the open contract', () => {
      const { result } = setup(existing)
      expect(result.current.values).toMatchObject({
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: '8750000',
        tenorBulan: '36',
        angsuranMulai: '2026-01-10',
      })
    })

    // The computed count is NOT what goes in the box. Prefilled from angsuranTerbayar, an
    // untouched edit would save 9 as an override and the unit would stop counting up — the truck
    // would still read "9 paid" a year later.
    it('leaves the paid box blank when the backend derived the count', () => {
      const { result } = setup(existing)
      expect(result.current.values.angsuranTerbayar).toBe('')
    })

    it('prefills the paid box when the operator had typed a count', () => {
      const { result } = setup({
        ...existing,
        lease: { ...existing.lease!, angsuranTerbayarOverride: 4 },
      } as FleetVehicle)
      expect(result.current.values.angsuranTerbayar).toBe('4')
    })

    it('prefills the documents it already has', () => {
      const { result } = setup(existing)
      expect(result.current.docRow('dt-stnk')).toEqual({
        nomor: 'STNK-1',
        issuedAt: '2026-01-10',
        expiresAt: '2031-01-10',
      })
    })

    // Anything absent from the payload is retired by the backend. A document whose type was
    // deactivated in master data has no row on the form to edit, so it must ride along unchanged
    // rather than be deleted by a Simpan the operator pressed without ever seeing it.
    it('carries through a document whose type is no longer offered', () => {
      const { result } = renderHook(() =>
        useVehicleForm({
          initial: existing,
          docTypes: [master({ id: 'dt-kir', code: 'kir', label: 'KIR' })],
          kepemilikan,
          leasing,
          drivers,
        }),
      )
      expect(result.current.buildPayload().documents).toEqual([
        { docTypeId: 'dt-stnk', nomor: 'STNK-1', issuedAt: '2026-01-10', expiresAt: '2031-01-10' },
      ])
    })

    // Every document type is required while docTypes is still loading, because the flags have
    // not arrived — an empty list must not read as "nothing is mandatory" and wave a blank form
    // through.
    it('demands nothing extra while the document types are still loading', () => {
      const { result } = renderHook(() =>
        useVehicleForm({ initial: existing, docTypes: [], kepemilikan, leasing, drivers }),
      )
      let ok = false
      act(() => {
        ok = result.current.validate()
      })
      expect(ok).toBe(true)
    })
  })
})
