'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { AlertCircle } from 'lucide-react';

interface UserProfile {
  name?: string;
  position?: string;
  employeeNumber?: string;
  phoneNumber?: string;
}

interface UserEditFormProps {
  initial: { profile?: UserProfile };
  onSubmit: (data: { profile: UserProfile }) => Promise<void>;
  onCancel: () => void;
}

export default function UserEditForm({ initial, onSubmit, onCancel }: UserEditFormProps) {
  const [profile, setProfile] = useState<UserProfile>({
    name: initial.profile?.name ?? '',
    position: initial.profile?.position ?? '',
    employeeNumber: initial.profile?.employeeNumber ?? '',
    phoneNumber: initial.profile?.phoneNumber ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof UserProfile, value: string) => setProfile((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ profile });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to update user'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <FormField label="Full Name" htmlFor="edit-name">
        <Input id="edit-name" value={profile.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={255} />
      </FormField>
      <FormField label="Position" htmlFor="edit-position">
        <Input id="edit-position" value={profile.position ?? ''} onChange={(e) => set('position', e.target.value)} maxLength={255} />
      </FormField>
      <FormField label="Employee Number" htmlFor="edit-empno">
        <Input id="edit-empno" value={profile.employeeNumber ?? ''} onChange={(e) => set('employeeNumber', e.target.value)} maxLength={50} />
      </FormField>
      <FormField label="Phone Number" htmlFor="edit-phone">
        <Input id="edit-phone" value={profile.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} maxLength={50} />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
      </div>
    </form>
  );
}
