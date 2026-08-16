'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { AvailableRoute, RouteGroup, RouteGroupPayload } from '../types'
import { RoutePicker } from './RoutePicker'

interface RouteGroupFormProps {
  initial?: RouteGroup
  routes: AvailableRoute[]
  onSubmit: (payload: RouteGroupPayload) => Promise<void>
  onCancel: () => void
}

export function RouteGroupForm({ initial, routes, onSubmit, onCancel }: RouteGroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<{ origin: string; dest: string }[]>(
    initial?.routes.map((r) => ({ origin: r.origin, dest: r.dest })) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    // Mirrors the ArrayMinSize(1) on the DTO: a group with no routes is a permanently empty column.
    if (selected.length === 0) {
      setError('Pick at least one route')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // description must be sent as null (not undefined) when cleared: the backend treats an
      // omitted field as "leave unchanged" on update, so undefined would make it impossible for
      // a user to ever clear an existing description.
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        routes: selected,
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
      <FormField label="Name" htmlFor="rg-name" required>
        <Input id="rg-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>
      <FormField label="Description" htmlFor="rg-description">
        <Input
          id="rg-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField label={`Routes (${selected.length} selected)`} htmlFor="rg-routes" required>
        <div id="rg-routes">
          <RoutePicker routes={routes} value={selected} onChange={setSelected} />
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
