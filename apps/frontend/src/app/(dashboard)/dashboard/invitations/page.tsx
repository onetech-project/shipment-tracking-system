'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface Invitation { id: string; email: string; status: string; expiresAt: string; createdAt: string; }

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

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <h1>Invitations</h1>
      <form onSubmit={sendInvitation} style={{ marginBottom: '1.5rem', display: 'flex', gap: '.5rem' }}>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Email address"
          required
          style={{ padding: '.5rem', flex: 1 }}
        />
        <button type="submit" disabled={sending} style={{ padding: '.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4 }}>
          {sending ? 'Sending…' : 'Invite'}
        </button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Expires</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{inv.email}</td>
              <td style={{ padding: '.5rem' }}>{inv.status}</td>
              <td style={{ padding: '.5rem' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
              <td style={{ padding: '.5rem' }}>
                {inv.status === 'pending' && (
                  <button onClick={() => cancel(inv.id)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
