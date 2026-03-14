'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface Organization { id: string; name: string; slug: string; isActive: boolean; createdAt: string; }

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Organization[]>('/organizations')
      .then((r) => setOrgs(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <h1>Organizations</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Slug</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{o.name}</td>
              <td style={{ padding: '.5rem' }}>{o.slug}</td>
              <td style={{ padding: '.5rem' }}>{o.isActive ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: '.5rem' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
