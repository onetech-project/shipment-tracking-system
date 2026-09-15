import { useMemo, useRef, useState } from 'react'
import {
  FleetDriver,
  FleetMasterRow,
  FleetVehicle,
  FleetVehicleDocumentPayload,
  FleetVehiclePayload,
} from '../../types'
import { addMonths } from '../../utils/date-offset'
import { normalizeNopolInput } from '../../utils/nopol'

// Matched by code rather than by id, because ids differ per environment while the seeded code
// does not. Mirrors SEWA_LEPAS_KUNCI_CODE on the backend.
const SEWA_LEPAS_KUNCI_CODE = 'sewa_lepas_kunci'

// The two seeded `leasing` rows that name no financier: a unit pointed at either was bought
// outright, so there is no contract to describe and the four contract fields have nothing to
// hold. Matched by code for the same reason as above — ids differ per environment.
const NO_FINANCING_CODES = ['lunas', 'tanpa_leasing']

// Every value is a string, because that is what an HTML input holds. Keeping numbers as numbers
// here would mean every input needed its own "is this the empty string or a zero" branch
// instead the conversion happens once, in buildPayload.
export interface VehicleFormValues {
  nopol: string
  merk: string
  tipe: string
  tahun: string
  kapasitas: string
  noRangka: string
  noMesin: string
  noBpkb: string
  jenisArmadaId: string
  kepemilikanId: string
  pemilikUnit: string
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: string
  tenorBulan: string
  angsuranMulai: string
  angsuranTerbayar: string
  driverId: string
  poolId: string
  statusId: string
  odometer: string
  catatan: string
}

export interface DocRowState {
  nomor: string
  issuedAt: string
  expiresAt: string
}

export interface UseVehicleFormOptions {
  initial?: FleetVehicle
  docTypes: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  leasing: FleetMasterRow[]
  drivers: FleetDriver[]
}

export interface VehicleFormApi {
  values: VehicleFormValues
  errors: Record<string, string>
  driver: FleetDriver | null
  isRented: boolean
  isFinanced: boolean
  setValue: (field: keyof VehicleFormValues, value: string) => void
  docRow: (docTypeId: string) => DocRowState
  setDocField: (docTypeId: string, field: keyof DocRowState, value: string) => void
  validate: () => boolean
  buildPayload: () => FleetVehiclePayload
}

const EMPTY_DOC: DocRowState = { nomor: '', issuedAt: '', expiresAt: '' }

// Spec §5.1, in the order the operator meets them on the form, so the first error they are sent
// to is the earliest one on screen. The label is the field's own caption: "Merk wajib diisi" is
// something an operator can act on, "field is required" is not.
const REQUIRED_FIELDS: { field: keyof VehicleFormValues; label: string }[] = [
  { field: 'nopol', label: 'Nomor polisi' },
  { field: 'merk', label: 'Merk' },
  { field: 'tipe', label: 'Tipe' },
  { field: 'jenisArmadaId', label: 'Jenis armada' },
  { field: 'tahun', label: 'Tahun pembuatan' },
  { field: 'kapasitas', label: 'Kapasitas muatan' },
  { field: 'noRangka', label: 'Nomor rangka' },
  { field: 'noMesin', label: 'Nomor mesin' },
  { field: 'noBpkb', label: 'Nomor BPKB' },
  { field: 'kepemilikanId', label: 'Status kepemilikan' },
  // The choice itself is always required: blank means the operator has not answered the
  // question, which is not the same as answering "no financing".
  { field: 'leasingId', label: 'Perusahaan leasing' },
  { field: 'poolId', label: 'Pool/domisili' },
]

// Required only once the chosen leasing row names a real financier. Demanded unconditionally,
// a cash-bought unit could never be saved: "Lunas" and "Tanpa leasing" exist in master data
// precisely so the operator can say there is no contract, and these four would then have no way
// out. The backend takes an explicit `lease: null` for that case.
const LEASE_REQUIRED_FIELDS: { field: keyof VehicleFormValues; label: string }[] = [
  { field: 'nomorKontrak', label: 'Nomor kontrak' },
  { field: 'cicilanPerBulan', label: 'Cicilan per bulan' },
  { field: 'tenorBulan', label: 'Total angsuran' },
  { field: 'angsuranMulai', label: 'Tanggal angsuran pertama' },
]

const rentedFrom = (values: VehicleFormValues, kepemilikan: FleetMasterRow[]): boolean =>
  kepemilikan.find((k) => k.id === values.kepemilikanId)?.code === SEWA_LEPAS_KUNCI_CODE

// Financed unless the chosen row is one of the two that name no financier. Written this way
// round deliberately: while `leasing` is still loading nothing matches, and an id the list does
// not know must read as "financed" — treating an unknown id as "no financing" would drop a
// contract the operator had already typed.
const financedFrom = (values: VehicleFormValues, leasing: FleetMasterRow[]): boolean => {
  const code = leasing.find((l) => l.id === values.leasingId)?.code
  return code === undefined || !NO_FINANCING_CODES.includes(code)
}

const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const textOrNull = (raw: string): string | null => raw.trim() || null

function initialValues(initial?: FleetVehicle): VehicleFormValues {
  return {
    nopol: initial?.nopol ?? '',
    merk: initial?.merk ?? '',
    tipe: initial?.tipe ?? '',
    tahun: initial?.tahun?.toString() ?? '',
    kapasitas: initial?.kapasitas ?? '',
    noRangka: initial?.noRangka ?? '',
    noMesin: initial?.noMesin ?? '',
    noBpkb: initial?.noBpkb ?? '',
    // The refs arrive as {id,label} objects; the selects need the bare id.
    jenisArmadaId: initial?.jenisArmada?.id ?? '',
    kepemilikanId: initial?.kepemilikan?.id ?? '',
    pemilikUnit: initial?.pemilikUnit ?? '',
    leasingId: initial?.lease?.leasing?.id ?? '',
    nomorKontrak: initial?.lease?.nomorKontrak ?? '',
    cicilanPerBulan: initial?.lease?.cicilanPerBulan?.toString() ?? '',
    tenorBulan: initial?.lease?.tenorBulan?.toString() ?? '',
    angsuranMulai: initial?.lease?.angsuranMulai ?? '',
    // The override, never the computed figure. Seeded from angsuranTerbayar, an untouched edit
    // would save today's derived count as a fixed one and the unit would stop counting up.
    angsuranTerbayar: initial?.lease?.angsuranTerbayarOverride?.toString() ?? '',
    driverId: initial?.driver?.id ?? '',
    poolId: initial?.pool?.id ?? '',
    statusId: initial?.status?.id ?? '',
    odometer: initial?.odometer?.toString() ?? '',
    catatan: initial?.catatan ?? '',
  }
}

export function useVehicleForm({
  initial,
  docTypes,
  kepemilikan,
  leasing,
  drivers,
}: UseVehicleFormOptions): VehicleFormApi {
  const [values, setValues] = useState<VehicleFormValues>(() => initialValues(initial))
  // Seeded from the vehicle's own documents, not from docTypes: docTypes can still be loading at
  // mount, and a row seeded from an empty list would leave the operator's existing documents
  // with nowhere to be carried from.
  const [docs, setDocs] = useState<Record<string, DocRowState>>(() =>
    Object.fromEntries(
      (initial?.documents ?? []).map((d) => [
        d.docTypeId,
        { nomor: d.nomor ?? '', issuedAt: d.issuedAt ?? '', expiresAt: d.expiresAt ?? '' },
      ]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const driver = useMemo(
    () => drivers.find((d) => d.id === values.driverId) ?? null,
    [drivers, values.driverId],
  )

  const isRented = useMemo(() => rentedFrom(values, kepemilikan), [kepemilikan, values])

  const isFinanced = useMemo(() => financedFrom(values, leasing), [leasing, values])

  // validate() and buildPayload() read through these, not through the render-time closure. A
  // caller that changes a field and validates in the same tick — which is what a select's
  // onChange does — would otherwise be judged on the values from before its own edit.
  const valuesRef = useRef(values)
  const docsRef = useRef(docs)

  const setValue = (field: keyof VehicleFormValues, value: string) => {
    // Requirement §1: the plate is tidied on every keystroke, so the field shows the exact string
    // that will be stored. Normalised only on submit, the operator would type "B 9114 KYZ" and
    // get back a duplicate warning naming a plate they never saw.
    const next = field === 'nopol' ? normalizeNopolInput(value) : value
    valuesRef.current = { ...valuesRef.current, [field]: next }
    setValues(valuesRef.current)
  }

  const docRow = (docTypeId: string): DocRowState => docsRef.current[docTypeId] ?? EMPTY_DOC

  const setDocField = (docTypeId: string, field: keyof DocRowState, value: string) => {
    const current = docsRef.current[docTypeId] ?? EMPTY_DOC
    const next: DocRowState = { ...current, [field]: value }
    // Spec §6.1: the expiry fills from the master row's default_valid_months, and only while
    // the box is still empty — a date the operator read off the paper document outranks one
    // this arithmetic guessed.
    if (field === 'issuedAt' && value && !current.expiresAt) {
      const months = docTypes.find((t) => t.id === docTypeId)?.defaultValidMonths
      if (months) next.expiresAt = addMonths(value, months)
    }
    docsRef.current = { ...docsRef.current, [docTypeId]: next }
    setDocs(docsRef.current)
  }

  const validate = (): boolean => {
    const found: Record<string, string> = {}
    const current = valuesRef.current

    const required = financedFrom(current, leasing)
      ? [...REQUIRED_FIELDS, ...LEASE_REQUIRED_FIELDS]
      : REQUIRED_FIELDS

    for (const { field, label } of required) {
      if (!current[field].trim()) found[field] = `${label} wajib diisi.`
    }

    // Spec §5.1 bersyarat: a rented unit belongs to somebody outside the company, and the
    // register has to be able to say who the truck goes back to.
    if (rentedFrom(current, kepemilikan) && !current.pemilikUnit.trim()) {
      found.pemilikUnit = 'Pemilik/vendor sewa wajib diisi untuk unit sewa lepas kunci.'
    }

    // The expiry, not the number: that is the field the warning system reads, and a document
    // number with no date warns nobody. While docTypes is still loading this loop is empty, and
    // the backend enforces the same rule on the way in.
    for (const type of docTypes) {
      if (type.isRequired === true && !(docsRef.current[type.id] ?? EMPTY_DOC).expiresAt) {
        found[`doc-${type.id}`] = `Masa berlaku ${type.label} wajib diisi.`
      }
    }

    setErrors(found)
    return Object.keys(found).length === 0
  }

  const buildPayload = (): FleetVehiclePayload => {
    const values = valuesRef.current
    const docs = docsRef.current

    // An untouched row is not a document — sent anyway it would become a live row with no dates,
    // which the warning system then reports as a document about to expire. A row whose type is
    // not in docTypes still rides along here with the values it arrived with, because anything
    // absent from this payload is retired by the backend.
    const documents: FleetVehicleDocumentPayload[] = Object.entries(docs)
      .filter(([, row]) => row.nomor.trim() || row.issuedAt || row.expiresAt)
      .map(([docTypeId, row]) => ({
        docTypeId,
        nomor: textOrNull(row.nomor),
        issuedAt: row.issuedAt || null,
        expiresAt: row.expiresAt || null,
      }))

    return {
      nopol: values.nopol.trim(),
      merk: textOrNull(values.merk),
      tipe: textOrNull(values.tipe),
      tahun: numberOrNull(values.tahun),
      kapasitas: textOrNull(values.kapasitas),
      noRangka: textOrNull(values.noRangka),
      noMesin: textOrNull(values.noMesin),
      noBpkb: textOrNull(values.noBpkb),
      pemilikUnit: textOrNull(values.pemilikUnit),
      odometer: numberOrNull(values.odometer),
      catatan: textOrNull(values.catatan),
      jenisArmadaId: values.jenisArmadaId || null,
      kepemilikanId: values.kepemilikanId || null,
      poolId: values.poolId || null,
      statusId: values.statusId || null,
      driverId: values.driverId || null,
      // An explicit null, not an object of empty strings: the backend reads null as "close any
      // open contract and open no replacement", which is exactly what a unit bought outright
      // means. An empty object would instead open a contract with no figures in it.
      lease: financedFrom(values, leasing)
        ? {
            leasingId: values.leasingId,
            nomorKontrak: values.nomorKontrak.trim(),
            cicilanPerBulan: Number(values.cicilanPerBulan),
            tenorBulan: Number(values.tenorBulan),
            angsuranMulai: values.angsuranMulai,
            // Blank means "work it out from the start date" (spec §5.2), which is why this is
            // null rather than 0 — zero is a real answer meaning nothing has been paid yet.
            angsuranTerbayar: numberOrNull(values.angsuranTerbayar),
          }
        : null,
      documents,
    }
  }

  return {
    values,
    errors,
    driver,
    isRented,
    isFinanced,
    setValue,
    docRow,
    setDocField,
    validate,
    buildPayload,
  }
}
