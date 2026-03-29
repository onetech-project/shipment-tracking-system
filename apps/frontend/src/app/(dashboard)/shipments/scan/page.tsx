'use client';
import QrScanner from '@/features/shipments/components/QrScanner';
import { PageHeader } from '@/components/shared/page-header';

export default function ShipmentScanPage() {
  return (
    <div className="max-w-lg">
      <PageHeader title="Scan Shipment QR Code" subtitle="Point your camera at a shipment QR code to look up the shipment details instantly." />
      <QrScanner />
    </div>
  );
}
