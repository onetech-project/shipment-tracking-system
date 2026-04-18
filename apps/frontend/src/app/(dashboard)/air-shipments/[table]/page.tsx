'use client'

import { useParams } from 'next/navigation'
import { AirShipmentsPage } from '@/features/air-shipments/components/AirShipmentsPage'

export default function CgkPage() {
  const { table } = useParams<{ table: string }>()
  return (
    <AirShipmentsPage
      endpoint={`/air-shipments/${table}`}
      tableName={`air_shipments_${table}`}
      title={`${table.toUpperCase()} Air Shipments`}
    />
  )
}
