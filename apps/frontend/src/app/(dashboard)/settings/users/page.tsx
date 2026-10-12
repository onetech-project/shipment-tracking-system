'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import UserEditForm from '@/features/users/components/user-edit-form';
import InactivateUserDialog from '@/features/users/components/inactivate-user-dialog';
import UnlockUserDialog from '@/features/users/components/unlock-user-dialog';
import { useAuth } from '@/features/auth/auth.context';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function UserCell({ user }: { user: User }) {
  const name = user.profile?.name ?? user.username;
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-2 text-xs font-bold text-white"
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
        <div className="truncate text-[11.5px] text-faint">{user.username}</div>
      </div>
    </div>
  );
}

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
      {error && <Banner tone="danger">Error: {error}</Banner>}

      {users.length === 0 ? (
        <EmptyState title="No users found." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Locked</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><UserCell user={u} /></TableCell>
                  <TableCell>
                    <StatusBadge variant={u.isActive ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell>
                    {u.isLocked ? <StatusBadge variant="locked" /> : <span className="text-faint">—</span>}
                  </TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', user: u })}>Edit</Button>
                      {u.isActive && u.id !== currentUser?.id && (
                        <Button size="sm" variant="destructive" onClick={() => setModal({ type: 'inactivate', user: u })}>Inactivate</Button>
                      )}
                      {u.isLocked && (
                        <Button size="sm" onClick={() => setModal({ type: 'unlock', user: u })}>Unlock</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

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
