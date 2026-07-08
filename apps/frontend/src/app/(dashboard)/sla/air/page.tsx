'use client'
import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'
import { AIR_SLA_MODE } from '@/features/air-shipments/sla-mode.config'

export default function SlaAirRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
      <SlaPage mode={AIR_SLA_MODE} />
    </Suspense>
  )
}
