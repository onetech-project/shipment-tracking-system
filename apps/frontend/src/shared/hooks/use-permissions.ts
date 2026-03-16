'use client';
import { useAuth } from '@/features/auth/auth.context';

export function usePermissions() {
  const { user } = useAuth();

  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const isAdmin = !isSuperAdmin && (user?.roles?.includes('admin') ?? false);
  const hasPermission = (permission: string) =>
    isSuperAdmin || (user?.roles?.some((r) => r === permission) ?? false);

  return { isSuperAdmin, isAdmin, hasPermission, isAdminOrAbove: isSuperAdmin || isAdmin };
}
