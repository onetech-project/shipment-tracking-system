'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import InvitationForm from '@/features/invitations/components/invitation-form';
import { usePermissions } from '@/shared/hooks/use-permissions';

interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#2563eb',
  accepted: '#16a34a',
  expired: '#64748b',
  revoked: '#dc2626',
};

const btnPrimary: React.CSSProperties = { padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { padding: '.25rem .75rem', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '.8rem' };
const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0' };

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

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Invitations</h1>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Send Invitation</button>
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      <div style={{ marginBottom: '1rem' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '.4rem .75rem', border: '1px solid #d1d5db', borderRadius: 4 }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Expires</th>
            <th style={thStyle}>Sent</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id}>
              <td style={tdStyle}>{inv.email}</td>
              <td style={tdStyle}>
                <span style={{ color: STATUS_COLORS[inv.status] ?? '#64748b', fontWeight: 500 }}>{inv.status}</span>
              </td>
              <td style={tdStyle}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
              <td style={tdStyle}>{new Date(inv.createdAt).toLocaleDateString()}</td>
              <td style={tdStyle}>
                {inv.status === 'pending' && (
                  <button style={{ ...btnSmall, background: '#fee2e2', color: '#dc2626' }} onClick={() => handleCancel(inv.id)}>
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
          {invitations.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No invitations found.</td></tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 480, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>Send Invitation</h2>
            <InvitationForm roles={roles} organizations={organizations} isSuperAdmin={isSuperAdmin} onSubmit={handleSend} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
