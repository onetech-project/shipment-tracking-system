'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface UnlockUserDialogProps {
  user: { id: string; username: string };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function UnlockUserDialog({ user, onConfirm, onClose }: UnlockUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to unlock user');
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-green-700">Unlock User</DialogTitle>
          <DialogDescription>
            Unlock account for <strong>{user.username}</strong>?
            This will reset the failed login counter and allow the user to sign in again.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
