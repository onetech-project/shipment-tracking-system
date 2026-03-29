'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface InactivateUserDialogProps {
  user: { id: string; username: string };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function InactivateUserDialog({ user, onConfirm, onClose }: InactivateUserDialogProps) {
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
      setError(msg ?? 'Failed to inactivate user');
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">Inactivate User</DialogTitle>
          <DialogDescription>
            Are you sure you want to inactivate <strong>{user.username}</strong>?
            The user will be signed out immediately and will not be able to log in until reactivated.
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
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Processing…' : 'Inactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
