'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface User { id: string; username: string; isActive: boolean; isLocked: boolean; lastLoginAt: string; createdAt: string; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<User[]>('/users')
      .then((r) => setUsers(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <h1>Users</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Username</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Locked</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Last Login</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{u.username}</td>
              <td style={{ padding: '.5rem' }}>{u.isActive ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: '.5rem' }}>{u.isLocked ? 'Locked' : '—'}</td>
              <td style={{ padding: '.5rem' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
