'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { MasterSelect, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface IdentitySectionProps {
  form: VehicleFormApi
  jenisArmada: FleetMasterRow[]
}

export function IdentitySection({ form, jenisArmada }: IdentitySectionProps) {
  const { values, errors, setValue } = form

  return (
    <Section title="Identitas Kendaraan">
      <FormField label="Nomor Polisi" htmlFor="vf-nopol" required error={errors.nopol}>
        <Input
          id="vf-nopol"
          value={values.nopol}
          onChange={(e) => setValue('nopol', e.target.value)}
          placeholder="B9114KYZ"
        />
      </FormField>

      <FormField label="Merk" htmlFor="vf-merk" required error={errors.merk}>
        <Input
          id="vf-merk"
          value={values.merk}
          onChange={(e) => setValue('merk', e.target.value)}
          placeholder="Mitsubishi"
        />
      </FormField>

      <FormField label="Tipe" htmlFor="vf-tipe" required error={errors.tipe}>
        <Input
          id="vf-tipe"
          value={values.tipe}
          onChange={(e) => setValue('tipe', e.target.value)}
          placeholder="Canter FE 74 HD"
        />
      </FormField>

      <MasterSelect
        id="vf-jenis-armada"
        label="Jenis Armada"
        required
        value={values.jenisArmadaId}
        onChange={(v) => setValue('jenisArmadaId', v)}
        options={jenisArmada}
        error={errors.jenisArmadaId}
      />

      <FormField label="Tahun Pembuatan" htmlFor="vf-tahun" required error={errors.tahun}>
        <Input
          id="vf-tahun"
          type="number"
          value={values.tahun}
          onChange={(e) => setValue('tahun', e.target.value)}
          placeholder="2021"
        />
      </FormField>

      {/* Free text on purpose: the unit can be tonnes, cubic metres, or both at once. */}
      <FormField
        label="Kapasitas Muatan"
        htmlFor="vf-kapasitas"
        required
        error={errors.kapasitas}
        hint="Contoh: 8 ton / 24 m3"
      >
        <Input
          id="vf-kapasitas"
          value={values.kapasitas}
          onChange={(e) => setValue('kapasitas', e.target.value)}
        />
      </FormField>

      <FormField label="Nomor Rangka" htmlFor="vf-rangka" required error={errors.noRangka}>
        <Input
          id="vf-rangka"
          value={values.noRangka}
          onChange={(e) => setValue('noRangka', e.target.value)}
          placeholder="MHMFE74P5MK000111"
        />
      </FormField>

      <FormField label="Nomor Mesin" htmlFor="vf-mesin" required error={errors.noMesin}>
        <Input
          id="vf-mesin"
          value={values.noMesin}
          onChange={(e) => setValue('noMesin', e.target.value)}
        />
      </FormField>

      <FormField label="Nomor BPKB" htmlFor="vf-bpkb" required error={errors.noBpkb}>
        <Input
          id="vf-bpkb"
          value={values.noBpkb}
          onChange={(e) => setValue('noBpkb', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
