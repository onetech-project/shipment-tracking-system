'use client';
import UploadHistory from '@/features/shipments/components/UploadHistory';
import Link from 'next/link';

export default function ShipmentHistoryPage() {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Upload History</h1>
        <Link
          href="/shipments/upload"
          style={{
            background: '#3b82f6',
            color: '#fff',
            textDecoration: 'none',
            padding: '0.4rem 1rem',
            borderRadius: 6,
            fontSize: '0.875rem',
          }}
        >
          + New Upload
        </Link>
      </div>
      <UploadHistory />
    </div>
  );
}
