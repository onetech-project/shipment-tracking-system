'use client'

// React is imported by name because each document renders as a keyed React.Fragment.
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { docLabels } from '../../utils/doc-labels'
import { Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface DocumentSectionProps {
  title: string
  form: VehicleFormApi
  types: FleetMasterRow[]
  // Section 6 sets this false: a service record has no document number to type, and asking for
  // one puts a question on the form that has no answer.
  showNomor?: boolean
  // Section 6 passes the vehicle's own catatan field down here. It is not a document, but it
  // belongs on that section — and a fieldset with two legends is not a thing.
  children?: React.ReactNode
}

// Serves sections 4, 5 and 6 — they differ only in which document types they list and in what
// their dates are called. Three near-identical components would drift apart on the first change.
export function DocumentSection({
  title,
  form,
  types,
  showNomor = true,
  children,
}: DocumentSectionProps) {
  const { docRow, setDocField, errors } = form

  return (
    <Section title={title}>
      {types.map((type) => {
        const labels = docLabels(type.code, type.label)
        const row = docRow(type.id)
        // Read off the master row rather than hardcoded here (spec §4.2), so the asterisk follows
        // whatever the admin has set on the Master Data page.
        const required = type.isRequired === true

        return (
          <React.Fragment key={type.id}>
            {showNomor && (
              <FormField label={`${type.label} Nomor`} htmlFor={`vf-doc-${type.id}-nomor`}>
                <Input
                  id={`vf-doc-${type.id}-nomor`}
                  value={row.nomor}
                  onChange={(e) => setDocField(type.id, 'nomor', e.target.value)}
                />
              </FormField>
            )}

            <FormField label={labels.issued} htmlFor={`vf-doc-${type.id}-issued`}>
              <Input
                id={`vf-doc-${type.id}-issued`}
                type="date"
                value={row.issuedAt}
                onChange={(e) => setDocField(type.id, 'issuedAt', e.target.value)}
              />
            </FormField>

            <FormField
              label={labels.expires}
              htmlFor={`vf-doc-${type.id}-expires`}
              required={required}
              error={errors[`doc-${type.id}`]}
            >
              <Input
                id={`vf-doc-${type.id}-expires`}
                type="date"
                value={row.expiresAt}
                onChange={(e) => setDocField(type.id, 'expiresAt', e.target.value)}
              />
            </FormField>
          </React.Fragment>
        )
      })}
      {children}
    </Section>
  )
}
