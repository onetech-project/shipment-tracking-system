'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import OrganizationForm from '@/features/organizations/components/organization-form';
import DeactivateOrgDialog from '@/features/organizations/components/deactivate-org-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Organization {
  id: string;
  name: string;
  slug: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
}

type Modal =
  | { type: 'create' }
  | { type: 'edit'; org: Organization }
  | { type: 'deactivate'; org: Organization }
  | null;

export default function OrganizationsSettingsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = () => {
    setLoading(true);
    apiClient
      .get<Organization[]>('/organizations')
      .then((r) => setOrgs(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (values: { name: string; address?: string }) => {
    await apiClient.post('/organizations', values);
    setModal(null);
    load();
  };

  const handleEdit = async (org: Organization, values: { name: string; address?: string }) => {
    await apiClient.patch(`/organizations/${org.id}`, values);
    setModal(null);
    load();
  };

  const handleDeactivate = async (org: Organization) => {
    await apiClient.patch(`/organizations/${org.id}/deactivate`);
    load();
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader
        title="Organizations"
        action={<Button onClick={() => setModal({ type: 'create' })}>+ New Organization</Button>}
      />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Address</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Created</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3 font-medium">{org.name}</td>
                <td className="px-4 py-3"><code className="text-xs text-muted-foreground">{org.slug}</code></td>
                <td className="px-4 py-3">{org.address ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge variant={org.isActive ? 'active' : 'inactive'} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', org })}>Edit</Button>
                    {org.isActive && (
                      <Button size="sm" variant="destructive" onClick={() => setModal({ type: 'deactivate', org })}>Deactivate</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No organizations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
            <OrganizationForm onSubmit={handleCreate} onCancel={() => setModal(null)} />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Organization</DialogTitle></DialogHeader>
            <OrganizationForm
              initial={{ name: modal.org.name, address: modal.org.address }}
              onSubmit={(values) => handleEdit(modal.org, values)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'deactivate' && (
        <DeactivateOrgDialog
          org={modal.org}
          onConfirm={() => handleDeactivate(modal.org)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
