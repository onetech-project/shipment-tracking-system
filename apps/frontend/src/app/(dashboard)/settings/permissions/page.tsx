'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import PermissionForm from '@/features/permissions/components/permission-form';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}

      <div className="mb-4">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name..."
          className="max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.name}</code>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.description ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No permissions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
