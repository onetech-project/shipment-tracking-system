'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetMasterRow } from '../../types'
import { MasterSelect, SELECT_CLASS, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface OperationalSectionProps {
  form: VehicleFormApi
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
  drivers: FleetDriver[]
}

export function OperationalSection({ form, pool, status, drivers }: OperationalSectionProps) {
  const { values, errors, driver, setValue } = form

  return (
    <Section title="Operasional & Sopir">
      {/* Drivers are rows of fleet_drivers, not master data, so this select is written out rather
          than routed through MasterSelect — the option label is the driver's name. Driver is
          optional, so the empty option states the unit's condition rather than instructing the
          operator, matching the "belum ada sopir" the list already shows for a driverless row. */}
      <FormField label="Sopir Penanggung Jawab" htmlFor="vf-sopir">
        <select
          id="vf-sopir"
          className={SELECT_CLASS}
          value={values.driverId}
          onChange={(e) => setValue('driverId', e.target.value)}
        >
          <option value="">— belum ditugaskan —</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nama}
            </option>
          ))}
        </select>
      </FormField>

      {/* Read-only on purpose (spec §6). The licence belongs to the driver and is held once, in
          the Sopir module; a copy typed here would drift the moment either side is renewed. */}
      <FormField
        label="Nomor SIM Sopir"
        htmlFor="vf-sim-nomor"
        hint="Terisi dari data sopir — ubah di modul Sopir"
      >
        <Input id="vf-sim-nomor" value={driver?.simNomor ?? ''} readOnly />
      </FormField>

      <FormField
        label="Masa Berlaku SIM"
        htmlFor="vf-sim-expires"
        hint="Terisi dari data sopir — ubah di modul Sopir"
      >
        <Input id="vf-sim-expires" type="date" value={driver?.simExpiresAt ?? ''} readOnly />
      </FormField>

      <MasterSelect
        id="vf-pool"
        label="Pool / Domisili"
        required
        value={values.poolId}
        onChange={(v) => setValue('poolId', v)}
        options={pool}
        error={errors.poolId}
      />

      <MasterSelect
        id="vf-status"
        label="Status Kendaraan"
        value={values.statusId}
        onChange={(v) => setValue('statusId', v)}
        options={status}
        error={errors.statusId}
      />

      <FormField
        label="Odometer Terakhir (km)"
        htmlFor="vf-odometer"
        error={errors.odometer}
        hint="Dipakai menghitung biaya servis per 1.000 km"
      >
        <Input
          id="vf-odometer"
          type="number"
          value={values.odometer}
          onChange={(e) => setValue('odometer', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
