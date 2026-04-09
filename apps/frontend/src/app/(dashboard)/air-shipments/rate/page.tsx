import { AirShipmentsPage } from '@/features/air-shipments/components/AirShipmentsPage';

export default function RatePage() {
  return <AirShipmentsPage endpoint="/air-shipments/rate" tableName="rate_per_station" title="Rate Per Station" defaultSortBy="dc" />;
}
