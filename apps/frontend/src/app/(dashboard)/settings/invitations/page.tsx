'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import InvitationForm from '@/features/invitations/components/invitation-form';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

interface Role { id: string; name: string; }
interface Organization { id: string; name: string; }

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'pending',
  accepted: 'active',
  expired: 'inactive',
  revoked: 'error',
};

const selectCls = 'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export default function InvitationsSettingsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const { isSuperAdmin } = usePermissions();

  const loadInvitations = () => {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    return apiClient
      .get<Invitation[]>(`/invitations${params}`)
      .then((r) => setInvitations(r.data))
      .catch((e) => setError(e.message));
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      loadInvitations(),
      apiClient.get<Role[]>('/roles').then((r) => setRoles(r.data)),
      apiClient.get<Organization[]>('/organizations').then((r) => setOrganizations(r.data)),
    ]).finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) loadInvitations(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (data: { email: string; name: string; roleId?: string; organizationId?: string }) => {
    await apiClient.post('/invitations', data);
    setShowModal(false);
    load();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this invitation?')) return;
    await apiClient.delete(`/invitations/${id}`);
    load();
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader
        title="Invitations"
        action={<Button onClick={() => setShowModal(true)}>+ Send Invitation</Button>}
      />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expires</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sent</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">{inv.email}</td>
                <td className="px-4 py-3">
                  <StatusBadge variant={STATUS_VARIANT[inv.status] ?? 'inactive'} label={inv.status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {inv.status === 'pending' && (
                    <Button size="sm" variant="destructive" onClick={() => handleCancel(inv.id)}>Cancel</Button>
                  )}
                </td>
              </tr>
            ))}
            {invitations.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No invitations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Invitation</DialogTitle></DialogHeader>
            <InvitationForm roles={roles} organizations={organizations} isSuperAdmin={isSuperAdmin} onSubmit={handleSend} onCancel={() => setShowModal(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
