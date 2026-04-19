'use client'
import { Plane, ClipboardList, Settings } from 'lucide-react'
import { useAuth } from '@/features/auth/auth.context'
import { PageHeader } from '@/components/shared/page-header'
import { ActionCard } from '@/components/shared/action-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermissions } from '@/shared/hooks/use-permissions'

export default function DashboardPage() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()

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
            <span className="text-sm text-muted-foreground">
              Organization: {user.organizationId}
            </span>
          )}
        </CardContent>
      </Card>
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          href="/air-shipments"
          title="Shipments"
          icon={Plane}
          description="View Air Shipments Table"
          data-testid="action-card-cgk"
        />
        {hasPermission('read.google_sheet_config') && (
          <ActionCard
            href="/air-shipments/google-sheet-config"
            title="Google Sheet Config"
            icon={ClipboardList}
            description="Manage Google Sheet Configurations"
            data-testid="action-card-google-sheet-config"
          />
        )}
        <ActionCard
          href="#"
          title="Coming Soon..."
          icon={Settings}
          description="More features coming soon!"
          data-testid="action-card-coming-soon"
          disabled
        />
        {/* Shipments action cards removed */}
      </section>
    </div>
  )
}
