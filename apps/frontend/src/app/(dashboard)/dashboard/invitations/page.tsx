'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Invitation { id: string; email: string; status: string; expiresAt: string; createdAt: string; }

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'pending',
  accepted: 'active',
  expired: 'inactive',
  revoked: 'error',
};

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [sending, setSending] = useState(false);

  const loadInvitations = () => {
    setLoading(true);
    apiClient.get<Invitation[]>('/invitations')
      .then((r) => setInvitations(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadInvitations, []);

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await apiClient.post('/invitations', { email: newEmail });
      setNewEmail('');
      loadInvitations();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const cancel = async (id: string) => {
    await apiClient.delete(`/invitations/${id}`);
    loadInvitations();
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader title="Invitations" />
      {error && <Banner tone="danger">Error: {error}</Banner>}
      <form onSubmit={sendInvitation} className="mb-6 flex gap-2">
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Email address"
          required
          className="max-w-xs"
        />
        <Button type="submit" disabled={sending}>{sending ? 'Sending...' : 'Invite'}</Button>
      </form>

      {invitations.length === 0 ? (
        <EmptyState title="No invitations found." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell>
                    <StatusBadge variant={STATUS_VARIANT[inv.status] ?? 'inactive'} label={inv.status} />
                  </TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {inv.status === 'pending' && (
                      <Button size="sm" variant="danger-soft" onClick={() => cancel(inv.id)}>Cancel</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
