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

  const canRead = !loading && !!user && hasPermission('read.route_group')
  const { data: groups, isLoading } = useRouteGroups({ enabled: canRead })
  // Disabling Create/Edit while routes are still loading (rather than threading a loading state
  // into RoutePicker) keeps RoutePicker's controlled-component contract untouched: the modal that
  // would show its "No routes available." empty state during the fetch simply can't open yet.
  const { data: routes, isLoading: isRoutesLoading } = useAvailableRoutes()
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

  // Mirrors the pnl page's shape: the useEffect above handles the redirect, but without these
  // early returns React can commit and paint a tick before the effect fires, flashing the whole
  // table at an unpermitted user. The backend still enforces this on GET /route-groups, so this
  // guard is only about page chrome and a pointless request, not data exposure.
  if (loading || !user) return null
  if (!hasPermission('read.route_group')) return null

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Route Group"
        action={
          hasPermission('create.route_group') ? (
            <Button onClick={() => setModal({ type: 'create' })} disabled={isRoutesLoading}>
              + New Group
            </Button>
          ) : undefined
        }
      />

      {(groups ?? []).length === 0 ? (
        <EmptyState title="No route groups yet." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Routes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups ?? []).map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.description ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.routes.map((r) => `${r.originLabel} → ${r.dest}`).join(', ')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {hasPermission('update.route_group') && (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={isRoutesLoading}
                          onClick={() => setModal({ type: 'edit', group })}
                        >
                          Edit
                        </Button>
                      )}
                      {hasPermission('delete.route_group') && (
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
