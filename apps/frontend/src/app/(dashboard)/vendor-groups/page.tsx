'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { VendorGroupForm } from '@/features/vendor-groups/components/VendorGroupForm'
import { DeleteVendorGroupDialog } from '@/features/vendor-groups/components/DeleteVendorGroupDialog'
import {
  useAvailableVendors,
  useCreateVendorGroup,
  useDeleteVendorGroup,
  useUpdateVendorGroup,
  useVendorGroups,
} from '@/features/vendor-groups/hooks/useVendorGroups'
import { VendorGroup, VendorGroupPayload } from '@/features/vendor-groups/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; group: VendorGroup }
  | { type: 'delete'; group: VendorGroup }
  | null

export default function VendorGroupsPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [modal, setModal] = useState<Modal>(null)

  const canRead = !loading && !!user && hasPermission('read.vendor_group')
  const { data: groups, isLoading } = useVendorGroups({ enabled: canRead })
  // Disabling Create/Edit while the vendor list is still loading, rather than threading a loading
  // state into VendorPicker, keeps the picker's controlled-component contract untouched: the modal
  // that would show "No vendors available." mid-fetch simply cannot open yet.
  const { data: vendors, isLoading: isVendorsLoading } = useAvailableVendors()
  const createGroup = useCreateVendorGroup()
  const updateGroup = useUpdateVendorGroup()
  const deleteGroup = useDeleteVendorGroup()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.vendor_group')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  const handleCreate = async (payload: VendorGroupPayload) => {
    await createGroup.mutateAsync(payload)
    setModal(null)
  }

  const handleEdit = async (group: VendorGroup, payload: VendorGroupPayload) => {
    await updateGroup.mutateAsync({ id: group.id, payload })
    setModal(null)
  }

  // The effect above handles the redirect, but without these early returns React can commit and
  // paint a tick before the effect fires, flashing the table at an unpermitted user. The backend
  // still enforces this on GET /vendor-groups, so this guard is about page chrome and a pointless
  // request, not data exposure.
  if (loading || !user) return null
  if (!hasPermission('read.vendor_group')) return null

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Vendor Group"
        action={
          hasPermission('create.vendor_group') ? (
            <Button onClick={() => setModal({ type: 'create' })} disabled={isVendorsLoading}>
              + New Group
            </Button>
          ) : undefined
        }
      />

      {(groups ?? []).length === 0 ? (
        <EmptyState title="No vendor groups yet." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendors</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups ?? []).map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.description ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{group.vendors.join(', ')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {hasPermission('update.vendor_group') && (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={isVendorsLoading}
                          onClick={() => setModal({ type: 'edit', group })}
                        >
                          Edit
                        </Button>
                      )}
                      {hasPermission('delete.vendor_group') && (
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onClick={() => setModal({ type: 'delete', group })}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Vendor Group</DialogTitle></DialogHeader>
            <VendorGroupForm
              vendors={vendors ?? []}
              onSubmit={handleCreate}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Vendor Group</DialogTitle></DialogHeader>
            <VendorGroupForm
              initial={modal.group}
              vendors={vendors ?? []}
              onSubmit={(payload) => handleEdit(modal.group, payload)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'delete' && (
        <DeleteVendorGroupDialog
          group={modal.group}
          onConfirm={() => deleteGroup.mutateAsync(modal.group.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
