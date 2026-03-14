'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth.context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  if (!user) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 240, padding: '1rem', background: '#1e293b', color: '#fff' }}>
        <h2 style={{ marginTop: 0 }}>Shipment Tracker</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><a href="/dashboard" style={{ color: '#94a3b8' }}>Dashboard</a></li>
          <li><a href="/dashboard/organizations" style={{ color: '#94a3b8' }}>Organizations</a></li>
          <li><a href="/dashboard/users" style={{ color: '#94a3b8' }}>Users</a></li>
          <li><a href="/dashboard/roles" style={{ color: '#94a3b8' }}>Roles</a></li>
          <li><a href="/dashboard/invitations" style={{ color: '#94a3b8' }}>Invitations</a></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
    </div>
  );
}
