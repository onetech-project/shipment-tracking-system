import { AirShipmentsPage } from '@/features/air-shipments/components/AirShipmentsPage';

export default function SubPage() {
  return <AirShipmentsPage endpoint="/air-shipments/sub" tableName="air_shipments_sub" title="SUB Air Shipments" />;
}
