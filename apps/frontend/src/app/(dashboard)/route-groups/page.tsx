'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { RouteGroupForm } from '@/features/route-groups/components/RouteGroupForm'
import { DeleteRouteGroupDialog } from '@/features/route-groups/components/DeleteRouteGroupDialog'
import {
  useAvailableRoutes,
  useCreateRouteGroup,
  useDeleteRouteGroup,
  useRouteGroups,
  useUpdateRouteGroup,
} from '@/features/route-groups/hooks/useRouteGroups'
import { RouteGroup, RouteGroupPayload } from '@/features/route-groups/types'

type Modal = { type: 'create' } | { type: 'edit'; group: RouteGroup } | { type: 'delete'; group: RouteGroup } | null

export default function RouteGroupsPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [modal, setModal] = useState<Modal>(null)

  const { data: groups, isLoading } = useRouteGroups()
  const { data: routes } = useAvailableRoutes()
  const createGroup = useCreateRouteGroup()
  const updateGroup = useUpdateRouteGroup()
  const deleteGroup = useDeleteRouteGroup()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.route_group')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  const handleCreate = async (payload: RouteGroupPayload) => {
    await createGroup.mutateAsync(payload)
    setModal(null)
  }

  const handleEdit = async (group: RouteGroup, payload: RouteGroupPayload) => {
    await updateGroup.mutateAsync({ id: group.id, payload })
    setModal(null)
  }

  if (loading || isLoading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Route Group"
        action={
          hasPermission('create.route_group') ? (
            <Button onClick={() => setModal({ type: 'create' })}>+ New Group</Button>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Routes</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((group, idx) => (
              <tr key={group.id} className={`border-t hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
                <td className="px-4 py-3 font-medium">{group.name}</td>
                <td className="px-4 py-3">{group.description ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {group.routes.map((r) => `${r.originLabel} → ${r.dest}`).join(', ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {hasPermission('update.route_group') && (
                      <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', group })}>
                        Edit
                      </Button>
                    )}
                    {hasPermission('delete.route_group') && (
                      <Button size="sm" variant="destructive" onClick={() => setModal({ type: 'delete', group })}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(groups ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No route groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Route Group</DialogTitle></DialogHeader>
            <RouteGroupForm routes={routes ?? []} onSubmit={handleCreate} onCancel={() => setModal(null)} />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Route Group</DialogTitle></DialogHeader>
            <RouteGroupForm
              initial={modal.group}
              routes={routes ?? []}
              onSubmit={(payload) => handleEdit(modal.group, payload)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'delete' && (
        <DeleteRouteGroupDialog
          group={modal.group}
          onConfirm={() => deleteGroup.mutateAsync(modal.group.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
