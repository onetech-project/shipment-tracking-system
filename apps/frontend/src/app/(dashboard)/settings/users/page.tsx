'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import UserEditForm from '@/features/users/components/user-edit-form';
import InactivateUserDialog from '@/features/users/components/inactivate-user-dialog';
import UnlockUserDialog from '@/features/users/components/unlock-user-dialog';
import { useAuth } from '@/features/auth/auth.context';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader title="Users" />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Locked</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">{u.profile?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge variant={u.isActive ? 'active' : 'inactive'} />
                </td>
                <td className="px-4 py-3">
                  {u.isLocked ? <StatusBadge variant="locked" /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', user: u })}>Edit</Button>
                    {u.isActive && u.id !== currentUser?.id && (
                      <Button size="sm" variant="destructive" onClick={() => setModal({ type: 'inactivate', user: u })}>Inactivate</Button>
                    )}
                    {u.isLocked && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setModal({ type: 'unlock', user: u })}>Unlock</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User — {modal.user.username}</DialogTitle>
            </DialogHeader>
            <UserEditForm
              initial={{ profile: modal.user.profile }}
              onSubmit={(data) => handleEdit(modal.user.id, data)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
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
