'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RouteGroup } from '../types'

interface DeleteRouteGroupDialogProps {
  group: RouteGroup
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function DeleteRouteGroupDialog({ group, onConfirm, onClose }: DeleteRouteGroupDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{group.name}”?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The {group.routes.length} route(s) in this group stay untouched — only the grouping is
          removed. Any PnL comparison currently showing this group will drop its column.
        </p>
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
