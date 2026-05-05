import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'

export default function SlaRoute() {
  return (
    <Suspense>
      <SlaPage />
    </Suspense>
  )
}
