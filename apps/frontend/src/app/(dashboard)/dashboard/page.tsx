'use client';
import { Upload, History, QrCode } from 'lucide-react';
import { useAuth } from '@/features/auth/auth.context';
import { PageHeader } from '@/components/shared/page-header';
import { ActionCard } from '@/components/shared/action-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Dashboard" />
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl">Welcome, {user?.username}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {user?.isSuperAdmin && <StatusBadge variant="active" label="Super Admin" />}
          {user?.organizationId && (
            <span className="text-sm text-muted-foreground">Organization: {user.organizationId}</span>
          )}
        </CardContent>
      </Card>
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard href="/shipments/upload" icon={Upload} title="Upload Shipments" description="Import a PDF file to bulk-load shipment records." data-testid="action-card-upload" />
        <ActionCard href="/shipments/history" icon={History} title="Upload History" description="Review past import jobs and their outcomes." data-testid="action-card-history" />
        <ActionCard href="/shipments/scan" icon={QrCode} title="QR Scan" description="Use your camera to look up a shipment by QR code." data-testid="action-card-scan" />
      </section>
    </div>
  );
}
