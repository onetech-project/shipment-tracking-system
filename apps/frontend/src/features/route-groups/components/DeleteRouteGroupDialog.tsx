'use client'

import { useState } from 'react'
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

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm()
      onClose()
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
