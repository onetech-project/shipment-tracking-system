import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetAlert, FleetAlertKind, FleetSeverity } from '../types'

interface FleetAlertWire extends Partial<FleetAlert> {
  subjectId: string
  label: string
}

function normalizeAlert(row: FleetAlertWire): FleetAlert {
  return {
    kind: (row.kind as FleetAlertKind) ?? 'document',
    vehicleId: row.vehicleId ?? null,
    nopol: row.nopol ?? null,
    merk: row.merk ?? null,
    tipe: row.tipe ?? null,
    pool: row.pool ?? null,
    subjectId: row.subjectId,
    label: row.label,
    expiresAt: row.expiresAt ?? '',
    daysLeft: row.daysLeft ?? 0,
    // 'warn' rather than 'ok': the backend only ever puts a row in this list because it needs
    // attention, so a missing severity must not render as a green badge.
    severity: (row.severity as FleetSeverity) ?? 'warn',
    driverName: row.driverName ?? null,
  }
}

export function useFleetAlerts(limit?: number) {
  return useQuery<FleetAlertWire[], Error, FleetAlert[]>({
    queryKey: ['fleet', 'alerts', limit],
    queryFn: () => apiClient.get('/fleet/alerts', { params: { limit } }).then((r) => r.data),
    select: (rows) => (rows ?? []).map(normalizeAlert),
    staleTime: 30 * 1000,
  })
}
