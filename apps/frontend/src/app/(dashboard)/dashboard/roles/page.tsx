'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface Role { id: string; name: string; description: string; isSystem: boolean; createdAt: string; }

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Role[]>('/roles')
      .then((r) => setRoles(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <h1>Roles</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Description</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>System</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{r.name}</td>
              <td style={{ padding: '.5rem' }}>{r.description ?? '—'}</td>
              <td style={{ padding: '.5rem' }}>{r.isSystem ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
