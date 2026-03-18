'use client';
import QrScanner from '@/features/shipments/components/QrScanner';

export default function ShipmentScanPage() {
  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Scan Shipment QR Code</h1>
      <p style={{ color: '#64748b' }}>
        Point your camera at a shipment QR code to look up the shipment details instantly.
      </p>
      <QrScanner />
    </div>
  );
}
