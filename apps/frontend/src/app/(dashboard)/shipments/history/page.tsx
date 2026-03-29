'use client';
import UploadHistory from '@/features/shipments/components/UploadHistory';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

export default function ShipmentHistoryPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Upload History"
        action={
          <Button asChild>
            <Link href="/shipments/upload">+ New Upload</Link>
          </Button>
        }
      />
      <UploadHistory />
    </div>
  );
}
