'use client';
import { useAuth } from '@/features/auth/auth.context';

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <h1>Welcome, {user?.username}</h1>
      <p>Organization ID: {user?.organizationId}</p>
      {user?.isSuperAdmin && <p><strong>Super Admin</strong></p>}
    </div>
  );
}
