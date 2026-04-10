'use client'

import { GoogleSheetConfigPanel } from '@/features/air-shipments/components/GoogleSheetConfigPanel'
import { usePermissions } from '@/shared/hooks/use-permissions'

export default function GoogleSheetConfigSettingsPage() {
  const { hasPermission } = usePermissions()
  return hasPermission('read.google_sheet_config') ? (
    <GoogleSheetConfigPanel />
  ) : (
    <div className="p-4 text-sm text-muted-foreground">
      You do not have permission to view this page.
    </div>
  )
}
