'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/features/auth/auth.context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 240, padding: '1rem', background: '#1e293b', color: '#fff' }}>
        <h2 style={{ marginTop: 0 }}>Shipment Tracker</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><Link href="/dashboard" style={{ color: '#94a3b8' }}>Dashboard</Link></li>
          <li><Link href="/dashboard/organizations" style={{ color: '#94a3b8' }}>Organizations</Link></li>
          <li><Link href="/dashboard/users" style={{ color: '#94a3b8' }}>Users</Link></li>
          <li><Link href="/dashboard/roles" style={{ color: '#94a3b8' }}>Roles</Link></li>
          <li><Link href="/dashboard/invitations" style={{ color: '#94a3b8' }}>Invitations</Link></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
    </div>
  );
}
