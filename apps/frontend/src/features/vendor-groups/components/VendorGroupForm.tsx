'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { AvailableVendor, VendorGroup, VendorGroupPayload } from '../types'
import { VendorPicker } from './VendorPicker'

interface VendorGroupFormProps {
  initial?: VendorGroup
  vendors: AvailableVendor[]
  onSubmit: (payload: VendorGroupPayload) => Promise<void>
  onCancel: () => void
}

export function VendorGroupForm({ initial, vendors, onSubmit, onCancel }: VendorGroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<string[]>(initial?.vendors ?? [])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    // Mirrors ArrayMinSize(1) on the DTO: a group with no vendors is a permanently empty column.
    if (selected.length === 0) {
      setError('Pick at least one vendor')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // The group name is trimmed because it is ours and only ever displayed. The vendor names are
      // sent exactly as the picker produced them — they are the key the comparison query joins on,
      // and trimming one side of that join is a silent miss.
      //
      // description must be null rather than undefined when cleared: the backend reads an omitted
      // field as "leave unchanged", so undefined would make an existing description unremovable.
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        vendors: selected,
      })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <FormField label="Name" htmlFor="vg-name" required>
        <Input id="vg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Description" htmlFor="vg-description">
        <Input
          id="vg-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField
        label="Vendors"
        htmlFor="vg-vendors"
        required
        hint="Titik amber = belum ada TO yang memakai vendor ini."
      >
        <div id="vg-vendors">
          <VendorPicker vendors={vendors} value={selected} onChange={setSelected} />
        </div>
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
