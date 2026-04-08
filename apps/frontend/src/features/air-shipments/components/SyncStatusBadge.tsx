'use client';

interface SyncStatusBadgeProps {
  isConnected: boolean;
  lastSyncAt: string | null;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Never';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
}

export function SyncStatusBadge({ isConnected, lastSyncAt }: SyncStatusBadgeProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${
          isConnected
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
        />
        {isConnected ? 'Live' : 'Offline'}
      </span>
      {lastSyncAt && (
        <span className="text-muted-foreground">Last sync: {formatRelativeTime(lastSyncAt)}</span>
      )}
    </div>
  );
}
