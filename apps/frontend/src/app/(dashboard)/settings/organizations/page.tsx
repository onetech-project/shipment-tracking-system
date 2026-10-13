'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import OrganizationForm from '@/features/organizations/components/organization-form';
import DeactivateOrgDialog from '@/features/organizations/components/deactivate-org-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { StagingBadge } from '@/components/shared/header-badges';
import { isStaging } from '@/lib/env';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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
        badge={isStaging() ? <StagingBadge /> : undefined}
        action={<Button onClick={() => setModal({ type: 'create' })}>+ New Organization</Button>}
      />
      {error && <Banner tone="danger">Error: {error}</Banner>}

      {orgs.length === 0 ? (
        <EmptyState title="No organizations found." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{org.slug}</code></TableCell>
                  <TableCell>{org.address ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge variant={org.isActive ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', org })}>Edit</Button>
                      {org.isActive && (
                        <Button size="sm" variant="danger-soft" onClick={() => setModal({ type: 'deactivate', org })}>Deactivate</Button>
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
