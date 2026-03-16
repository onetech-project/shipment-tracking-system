'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import UserEditForm from '@/features/users/components/user-edit-form';
import InactivateUserDialog from '@/features/users/components/inactivate-user-dialog';
import UnlockUserDialog from '@/features/users/components/unlock-user-dialog';
import { useAuth } from '@/features/auth/auth.context';

interface UserProfile {
  name?: string;
  position?: string;
  employeeNumber?: string;
  phoneNumber?: string;
}

interface User {
  id: string;
  username: string;
  isActive: boolean;
  isLocked: boolean;
  profile?: UserProfile;
  lastLoginAt?: string;
  createdAt: string;
}

type Modal =
  | { type: 'edit'; user: User }
  | { type: 'inactivate'; user: User }
  | { type: 'unlock'; user: User }
  | null;

const btnSmall: React.CSSProperties = { padding: '.25rem .75rem', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '.8rem' };
const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0' };

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const { user: currentUser } = useAuth();

  const load = () => {
    setLoading(true);
    apiClient
      .get<User[]>('/users')
      .then((r) => setUsers(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleEdit = async (userId: string, data: { profile: UserProfile }) => {
    await apiClient.patch(`/users/${userId}`, data);
    setModal(null);
    load();
  };

  const handleInactivate = async (userId: string) => {
    await apiClient.patch(`/users/${userId}/inactivate`);
    load();
  };

  const handleUnlock = async (userId: string) => {
    await apiClient.patch(`/users/${userId}/unlock`);
    load();
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Users</h1>
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Username</th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Locked</th>
            <th style={thStyle}>Last Login</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={tdStyle}>{u.username}</td>
              <td style={tdStyle}>{u.profile?.name ?? '—'}</td>
              <td style={tdStyle}>
                <span style={{ color: u.isActive ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={tdStyle}>
                {u.isLocked ? (
                  <span style={{ color: '#dc2626', fontWeight: 500 }}>Locked</span>
                ) : (
                  <span style={{ color: '#64748b' }}>—</span>
                )}
              </td>
              <td style={tdStyle}>
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                  <button style={{ ...btnSmall, background: '#e2e8f0' }} onClick={() => setModal({ type: 'edit', user: u })}>
                    Edit
                  </button>
                  {u.isActive && u.id !== currentUser?.id && (
                    <button style={{ ...btnSmall, background: '#fee2e2', color: '#dc2626' }} onClick={() => setModal({ type: 'inactivate', user: u })}>
                      Inactivate
                    </button>
                  )}
                  {u.isLocked && (
                    <button style={{ ...btnSmall, background: '#dcfce7', color: '#16a34a' }} onClick={() => setModal({ type: 'unlock', user: u })}>
                      Unlock
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No users found.</td></tr>
          )}
        </tbody>
      </table>

      {modal?.type === 'edit' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 480, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>Edit User — {modal.user.username}</h2>
            <UserEditForm
              initial={{ profile: modal.user.profile }}
              onSubmit={(data) => handleEdit(modal.user.id, data)}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      )}

      {modal?.type === 'inactivate' && (
        <InactivateUserDialog
          user={modal.user}
          onConfirm={() => handleInactivate(modal.user.id)}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'unlock' && (
        <UnlockUserDialog
          user={modal.user}
          onConfirm={() => handleUnlock(modal.user.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
