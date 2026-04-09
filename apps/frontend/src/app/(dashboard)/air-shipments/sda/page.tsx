import { AirShipmentsPage } from '@/features/air-shipments/components/AirShipmentsPage';

export default function SdaPage() {
  return <AirShipmentsPage endpoint="/air-shipments/sda" tableName="air_shipments_sda" title="SDA Air Shipments" />;
}
