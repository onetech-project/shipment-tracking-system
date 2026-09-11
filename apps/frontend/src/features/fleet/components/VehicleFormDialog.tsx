'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetMasterRow, FleetVehicle, FleetVehiclePayload } from '../types'
import { apiErrorMessage } from '../utils/api-error'

interface VehicleMasterData {
  jenisArmada: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
}

interface VehicleFormDialogProps {
  open: boolean
  initial?: FleetVehicle
  masterData: VehicleMasterData
  drivers: FleetDriver[]
  onSubmit: (payload: FleetVehiclePayload) => Promise<void>
  onClose: () => void
}

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

// A blank number input reads as ''. Number('') is 0, which would register a 1970 model year and
// a zero odometer on a used truck — both plausible enough to go unnoticed.
const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function VehicleFormDialog({
  open,
  initial,
  masterData,
  drivers,
  onSubmit,
  onClose,
}: VehicleFormDialogProps) {
  const [nopol, setNopol] = useState(initial?.nopol ?? '')
  const [merk, setMerk] = useState(initial?.merk ?? '')
  const [tipe, setTipe] = useState(initial?.tipe ?? '')
  const [tahun, setTahun] = useState(initial?.tahun?.toString() ?? '')
  const [kapasitas, setKapasitas] = useState(initial?.kapasitas ?? '')
  const [noRangka, setNoRangka] = useState(initial?.noRangka ?? '')
  const [noMesin, setNoMesin] = useState(initial?.noMesin ?? '')
  const [noBpkb, setNoBpkb] = useState(initial?.noBpkb ?? '')
  const [pemilikUnit, setPemilikUnit] = useState(initial?.pemilikUnit ?? '')
  const [odometer, setOdometer] = useState(initial?.odometer?.toString() ?? '')
  const [catatan, setCatatan] = useState(initial?.catatan ?? '')
  // The refs arrive as {id,label} objects; the selects need the bare id.
  const [jenisArmadaId, setJenisArmadaId] = useState(initial?.jenisArmada?.id ?? '')
  const [kepemilikanId, setKepemilikanId] = useState(initial?.kepemilikan?.id ?? '')
  const [poolId, setPoolId] = useState(initial?.pool?.id ?? '')
  const [statusId, setStatusId] = useState(initial?.status?.id ?? '')
  const [driverId, setDriverId] = useState(initial?.driver?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nopol.trim()) {
      setError('Nomor polisi wajib diisi.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // Optional fields travel as null, never '': the backend reads an absent field as "leave
      // unchanged", so an empty string would make a cleared field unremovable.
      await onSubmit({
        nopol: nopol.trim(),
        merk: merk.trim() || null,
        tipe: tipe.trim() || null,
        tahun: numberOrNull(tahun),
        kapasitas: kapasitas.trim() || null,
        noRangka: noRangka.trim() || null,
        noMesin: noMesin.trim() || null,
        noBpkb: noBpkb.trim() || null,
        pemilikUnit: pemilikUnit.trim() || null,
        odometer: numberOrNull(odometer),
        catatan: catatan.trim() || null,
        jenisArmadaId: jenisArmadaId || null,
        kepemilikanId: kepemilikanId || null,
        poolId: poolId || null,
        statusId: statusId || null,
        driverId: driverId || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Terjadi kesalahan. Coba lagi.'))
    } finally {
      setSubmitting(false)
    }
  }

  const masterSelect = (
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    options: FleetMasterRow[],
  ) => (
    <FormField label={label} htmlFor={id}>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">— pilih —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah armada' : 'Tambah armada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nomor polisi" required htmlFor="vf-nopol">
              <Input id="vf-nopol" value={nopol} onChange={(e) => setNopol(e.target.value)} />
            </FormField>

            <FormField label="Merk" htmlFor="vf-merk">
              <Input id="vf-merk" value={merk} onChange={(e) => setMerk(e.target.value)} />
            </FormField>

            <FormField label="Tipe" htmlFor="vf-tipe">
              <Input id="vf-tipe" value={tipe} onChange={(e) => setTipe(e.target.value)} />
            </FormField>

            <FormField label="Tahun" htmlFor="vf-tahun">
              <Input
                id="vf-tahun"
                type="number"
                value={tahun}
                onChange={(e) => setTahun(e.target.value)}
              />
            </FormField>

            <FormField label="Kapasitas" htmlFor="vf-kapasitas">
              <Input
                id="vf-kapasitas"
                value={kapasitas}
                onChange={(e) => setKapasitas(e.target.value)}
              />
            </FormField>

            <FormField label="Odometer" htmlFor="vf-odometer">
              <Input
                id="vf-odometer"
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </FormField>

            <FormField label="Nomor rangka" htmlFor="vf-rangka">
              <Input
                id="vf-rangka"
                value={noRangka}
                onChange={(e) => setNoRangka(e.target.value)}
              />
            </FormField>

            <FormField label="Nomor mesin" htmlFor="vf-mesin">
              <Input id="vf-mesin" value={noMesin} onChange={(e) => setNoMesin(e.target.value)} />
            </FormField>

            <FormField label="Nomor BPKB" htmlFor="vf-bpkb">
              <Input id="vf-bpkb" value={noBpkb} onChange={(e) => setNoBpkb(e.target.value)} />
            </FormField>

            <FormField label="Pemilik unit" htmlFor="vf-pemilik">
              <Input
                id="vf-pemilik"
                value={pemilikUnit}
                onChange={(e) => setPemilikUnit(e.target.value)}
              />
            </FormField>

            {masterSelect(
              'vf-jenis-armada',
              'Jenis armada',
              jenisArmadaId,
              setJenisArmadaId,
              masterData.jenisArmada,
            )}
            {masterSelect(
              'vf-kepemilikan',
              'Kepemilikan',
              kepemilikanId,
              setKepemilikanId,
              masterData.kepemilikan,
            )}
            {masterSelect('vf-pool', 'Pool', poolId, setPoolId, masterData.pool)}
            {masterSelect('vf-status', 'Status unit', statusId, setStatusId, masterData.status)}

            <FormField label="Sopir" htmlFor="vf-driver">
              <select
                id="vf-driver"
                className={SELECT_CLASS}
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">— belum ditugaskan —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nama}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Catatan" htmlFor="vf-catatan">
            <textarea
              id="vf-catatan"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </FormField>

          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle size={14} aria-hidden="true" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
