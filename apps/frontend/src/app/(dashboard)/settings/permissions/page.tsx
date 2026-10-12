'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import PermissionForm from '@/features/permissions/components/permission-form';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Permission {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export default function PermissionsSettingsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('');
  const { isSuperAdmin } = usePermissions();

  const load = () => {
    setLoading(true);
    apiClient
      .get<Permission[]>('/permissions?limit=500')
      .then((r) => setPermissions(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (data: { name: string; description?: string }) => {
    await apiClient.post('/permissions', data);
    setShowModal(false);
    load();
  };

  const filtered = filter
    ? permissions.filter((p) => p.name.includes(filter.toLowerCase()))
    : permissions;

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader
        title="Permissions"
        action={isSuperAdmin ? <Button onClick={() => setShowModal(true)}>+ New Permission</Button> : undefined}
      />
      {error && <Banner tone="danger">Error: {error}</Banner>}

      <div className="mb-4">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name..."
          className="max-w-xs"
        />
      </div>

      <TableWrap>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{p.name}</code>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.description ?? '—'}</TableCell>
                <TableCell className="tabular text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <EmptyState title="No permissions found." />}
      </TableWrap>

      {showModal && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Permission</DialogTitle></DialogHeader>
            <PermissionForm onSubmit={handleCreate} onCancel={() => setShowModal(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
