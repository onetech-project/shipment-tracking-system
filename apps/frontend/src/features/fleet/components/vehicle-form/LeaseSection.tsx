'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { MasterSelect, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface LeaseSectionProps {
  form: VehicleFormApi
  kepemilikan: FleetMasterRow[]
  leasing: FleetMasterRow[]
}

export function LeaseSection({ form, kepemilikan, leasing }: LeaseSectionProps) {
  const { values, errors, isRented, isFinanced, setValue } = form

  return (
    <Section title="Kepemilikan & Leasing">
      <MasterSelect
        id="vf-kepemilikan"
        label="Status Kepemilikan Unit"
        required
        value={values.kepemilikanId}
        onChange={(v) => setValue('kepemilikanId', v)}
        options={kepemilikan}
        error={errors.kepemilikanId}
      />

      {/* Disabled rather than hidden: a field that vanishes as the dropdown changes makes the
          section jump under the operator's cursor, and they lose their place in eight fields. */}
      <FormField
        label="Pemilik / Vendor Sewa"
        htmlFor="vf-pemilik"
        required={isRented}
        error={errors.pemilikUnit}
        hint={isRented ? undefined : 'Hanya untuk unit sewa lepas kunci'}
      >
        <Input
          id="vf-pemilik"
          value={values.pemilikUnit}
          disabled={!isRented}
          onChange={(e) => setValue('pemilikUnit', e.target.value)}
        />
      </FormField>

      <MasterSelect
        id="vf-leasing"
        label="Perusahaan Leasing"
        required
        value={values.leasingId}
        onChange={(v) => setValue('leasingId', v)}
        options={leasing}
        error={errors.leasingId}
      />

      {/* Hidden rather than disabled, unlike Pemilik above: "Lunas" and "Tanpa leasing" mean
          there is no contract at all, so these four describe nothing. The hook drops the lease
          from the payload in the same case, and stops demanding them. */}
      {isFinanced && (
        <>
          <FormField label="Nomor Kontrak" htmlFor="vf-kontrak" required error={errors.nomorKontrak}>
            <Input
              id="vf-kontrak"
              value={values.nomorKontrak}
              onChange={(e) => setValue('nomorKontrak', e.target.value)}
              placeholder="MTF-2024-03-11872"
            />
          </FormField>

          {/* No thousands separators, per requirement §2: the operator types the figure the
              contract shows and the input parses it without a formatter standing in between. */}
          <FormField
            label="Cicilan / Sewa per Bulan (Rp)"
            htmlFor="vf-cicilan"
            required
            error={errors.cicilanPerBulan}
          >
            <Input
              id="vf-cicilan"
              type="number"
              value={values.cicilanPerBulan}
              onChange={(e) => setValue('cicilanPerBulan', e.target.value)}
              placeholder="8750000"
            />
          </FormField>

          <FormField
            label="Total Angsuran (bulan)"
            htmlFor="vf-tenor"
            required
            error={errors.tenorBulan}
          >
            <Input
              id="vf-tenor"
              type="number"
              value={values.tenorBulan}
              onChange={(e) => setValue('tenorBulan', e.target.value)}
              placeholder="36"
            />
          </FormField>

          <FormField
            label="Tanggal Angsuran Pertama"
            htmlFor="vf-angsuran-mulai"
            required
            error={errors.angsuranMulai}
          >
            <Input
              id="vf-angsuran-mulai"
              type="date"
              value={values.angsuranMulai}
              onChange={(e) => setValue('angsuranMulai', e.target.value)}
            />
          </FormField>
        </>
      )}

      {/* The one optional field on the section (requirement §2). Left blank the backend counts
          the months since the first instalment, and keeps counting as they pass. */}
      <FormField
        label="Angsuran Sudah Dibayar"
        htmlFor="vf-angsuran-terbayar"
        hint="Kosongkan untuk dihitung otomatis dari tanggal angsuran pertama"
      >
        <Input
          id="vf-angsuran-terbayar"
          type="number"
          value={values.angsuranTerbayar}
          onChange={(e) => setValue('angsuranTerbayar', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
