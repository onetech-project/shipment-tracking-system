import { AirShipmentsPage } from '@/features/air-shipments/components/AirShipmentsPage';

export default function RoutesPage() {
  return <AirShipmentsPage endpoint="/air-shipments/routes" tableName="route_master" title="Route Master" defaultSortBy="origin" />;
}
