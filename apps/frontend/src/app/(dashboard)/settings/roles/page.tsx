'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import RolePermissionsPanel from '@/features/roles/components/role-permissions-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { FormField } from '@/components/shared/form-field';

interface RolePermission {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
  isSystem?: boolean;
  permissions: RolePermission[];
  createdAt: string;
}

type Modal =
  | { type: 'create' }
  | { type: 'edit-perms'; role: Role }
  | null;

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient
      .get<Role[]>('/roles')
      .then((r) => setRoles(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.post('/roles', { name: newRoleName.trim() });
      setNewRoleName('');
      setModal(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/roles/${id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to delete role');
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader
        title="Roles"
        action={<Button onClick={() => setModal({ type: 'create' })}>+ New Role</Button>}
      />
      {error && <Banner tone="danger">{error}</Banner>}

      <TableWrap>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell><code className="text-xs">{role.name}</code></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions?.slice(0, 5).map((p) => (
                      <Badge key={p.id} variant="info">{p.name}</Badge>
                    ))}
                    {role.permissions?.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{role.permissions.length - 5} more</span>
                    )}
                    {role.permissions?.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </TableCell>
                <TableCell>
                  {role.isSystem
                    ? <Badge variant="neutral">System</Badge>
                    : <span className="text-xs text-muted-foreground">Custom</span>}
                </TableCell>
                <TableCell className="tabular text-xs text-muted-foreground">{new Date(role.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit-perms', role })}>Permissions</Button>
                    {!role.isSystem && (
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(role.id, role.name)}>Delete</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {roles.length === 0 && <EmptyState title="No roles found." />}
      </TableWrap>

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Role</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && <Banner tone="danger">{error}</Banner>}
              <FormField
                label="Role Name"
                htmlFor="new-role-name"
                required
                hint="Lowercase letters, numbers, hyphens and underscores only."
              >
                <Input
                  id="new-role-name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. warehouse-supervisor"
                  pattern="^[a-z0-9\-_]+$"
                  title="Lowercase letters, numbers, hyphens and underscores only"
                  required
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button>
                <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Role'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit-perms' && (
        <RolePermissionsPanel
          roleId={modal.role.id}
          currentPermissionIds={modal.role?.permissions?.map((p) => p.id) ?? []}
          onSaved={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
