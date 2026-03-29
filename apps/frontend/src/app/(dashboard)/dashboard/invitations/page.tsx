'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}
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

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expires</th>
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
                <td className="px-4 py-3">
                  {inv.status === 'pending' && (
                    <Button size="sm" variant="destructive" onClick={() => cancel(inv.id)}>Cancel</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
