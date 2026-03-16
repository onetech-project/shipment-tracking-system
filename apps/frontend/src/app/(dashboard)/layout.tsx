'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth.context';
import Navigation from '@/features/auth/components/navigation';

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
      <Navigation />
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
    </div>
  );
}
