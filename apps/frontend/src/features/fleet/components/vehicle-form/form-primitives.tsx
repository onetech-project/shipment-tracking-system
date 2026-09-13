'use client'

import * as React from 'react'
import { FormField } from '@/components/shared/form-field'
import { cn } from '@/lib/utils'
import { FleetMasterRow } from '../../types'

export const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

// A real <fieldset><legend>, not a styled div: the legend is what a screen reader announces when
// the operator tabs into the group, and on a 22-field form that announcement is the only thing
// telling them which of the six sections they are in.
// Spelled out in full, never interpolated. Tailwind scans this file as text, so a class assembled
// at runtime from a variable is one it never sees and never generates — the stylesheet ends up
// without the rule and the grid silently collapses to a single column in the browser, with
// nothing in tsc or jest to catch it. A lookup keeps every value a literal the scanner can find.
const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

export function Section({
  title,
  children,
  // Three columns across the form, which the wide dialog has room for. Servis dan Perawatan is
  // the exception and passes 2: with no document number to type it has only two date fields, and
  // a third column there would leave a gap rather than fill one.
  cols = 3,
}: {
  title: string
  children: React.ReactNode
  cols?: number
}) {
  return (
    <fieldset className="rounded-md border px-4 pb-4 pt-2">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className={cn('grid gap-4', GRID_COLS[cols] ?? GRID_COLS[3])}>{children}</div>
    </fieldset>
  )
}

interface MasterSelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FleetMasterRow[]
  required?: boolean
  error?: string
  placeholder?: string
  className?: string
}

// Every dropdown on this form is a master-data list, so they all render through here — one place
// to fix when the empty option or the error wiring turns out wrong, rather than five.
export function MasterSelect({
  id,
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = '— pilih —',
  className,
}: MasterSelectProps) {
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} className={className}>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}
