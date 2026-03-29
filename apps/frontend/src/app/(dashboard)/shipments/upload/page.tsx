'use client';
import PdfUploader from '@/features/shipments/components/PdfUploader';
import ImportStatus from '@/features/shipments/components/ImportStatus';
import ConflictReview from '@/features/shipments/components/ConflictReview';
import { useImportStatus } from '@/features/shipments/hooks/useImportStatus';

export default function ShipmentUploadPage() {
  const { upload, status, errors, resolve, isUploading, error } = useImportStatus();

  return (
    <div style={{ maxWidth: 800 }}>
      <h1>Upload Shipments PDF</h1>
      <p style={{ color: '#64748b' }}>
        Upload an internal shipment template PDF to import records. Duplicate shipment IDs will be
        flagged for review before any existing records are changed.
      </p>

      <PdfUploader onUpload={upload} isUploading={isUploading} />

      {error && (
        <p style={{ color: '#ef4444', marginTop: '0.5rem' }}>{error}</p>
      )}

      {status && <ImportStatus status={status} />}

      {status?.status === 'awaiting_conflict_review' && errors && (
        <ConflictReview errors={errors.items} onResolve={resolve} />
      )}
    </div>
  );
}
