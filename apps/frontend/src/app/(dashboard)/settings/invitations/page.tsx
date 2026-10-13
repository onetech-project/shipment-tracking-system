'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import InvitationForm from '@/features/invitations/components/invitation-form';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StagingBadge } from '@/components/shared/header-badges';
import { isStaging } from '@/lib/env';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar } from '@/components/shared/filter-bar';
import { KpiCard, KpiGrid } from '@/components/shared/kpi-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHead } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { fieldClass } from '@/components/ui/input';
import { Hourglass, Mail, MailCheck, MailX } from 'lucide-react';

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

// Matches Input's own styling (the shared fieldClass export), so this select reads as the same
// field as every other filter control in the app.
const selectCls = `w-full ${fieldClass}`;

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
        subtitle="Kirim undangan ke calon pengguna aplikasi."
        badge={isStaging() ? <StagingBadge /> : undefined}
        action={<Button onClick={() => setShowModal(true)}>+ Send Invitation</Button>}
      />
      {error && <Banner tone="danger">Error: {error}</Banner>}

      {invitations.length > 0 && (
        <KpiGrid cols={4}>
          <KpiCard
            label="total sent"
            value={String(invitations.length)}
            hint="all time"
            icon={Mail}
            tone="brand"
          />
          <KpiCard
            label="accepted"
            value={String(invitations.filter((i) => i.status === 'accepted').length)}
            hint={`${((invitations.filter((i) => i.status === 'accepted').length / invitations.length) * 100).toFixed(1)}%`}
            icon={MailCheck}
            tone="brand"
          />
          <KpiCard
            label="pending"
            value={String(invitations.filter((i) => i.status === 'pending').length)}
            hint="menunggu"
            icon={Hourglass}
            tone="warn"
          />
          <KpiCard
            label="expired"
            value={String(invitations.filter((i) => i.status === 'expired').length)}
            hint="kadaluarsa"
            icon={MailX}
            tone="danger"
          />
        </KpiGrid>
      )}

      <FilterBar>
        <div className="min-w-[160px]">
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
      </FilterBar>

      {invitations.length === 0 ? (
        <EmptyState title="No invitations found." />
      ) : (
        <Card>
          <CardHead icon={Mail} title="Daftar Undangan" subtitle="Status undangan pengguna" />
          <CardContent className="p-0">
            <TableWrap className="rounded-none border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">{inv.email}</TableCell>
                      <TableCell>
                        <StatusBadge variant={STATUS_VARIANT[inv.status] ?? 'inactive'} label={inv.status} />
                      </TableCell>
                      <TableCell className="tabular text-xs text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                      <TableCell className="tabular text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {inv.status === 'pending' && (
                          <Button size="sm" variant="danger-soft" onClick={() => handleCancel(inv.id)}>Cancel</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

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
