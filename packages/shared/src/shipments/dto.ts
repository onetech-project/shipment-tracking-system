// Shared request/response types for the shipments feature.
// Used by both backend (response serialisation) and frontend (API client typing).

export type ShipmentStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';

export type UploadStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'awaiting_conflict_review'
  | 'failed';

export type ErrorType = 'validation' | 'duplicate' | 'parse';

export type ConflictAction = 'overwrite' | 'skip';

// ——— Shipment lookup (QR scan) ———

export interface ShipmentResponse {
  id: string;
  shipmentId: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  carrier: string | null;
  estimatedDeliveryDate: string | null; // ISO date string yyyy-MM-dd
  contentsDescription: string | null;
}

// ——— Import / upload ———

export interface UploadInitiatedResponse {
  uploadId: string;
  status: 'queued';
  message: string;
}

export interface ImportStatusResponse {
  uploadId: string;
  originalFilename: string;
  status: UploadStatus;
  totalRowsDetected: number;
  rowsImported: number;
  rowsFailed: number;
  rowsConflicted: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ImportErrorRow {
  id: string;
  rowNumber: number;
  errorType: ErrorType;
  fieldName: string | null;
  message: string;
  incomingPayload: Record<string, unknown> | null;
  existingShipmentId: string | null;
  resolved: boolean;
  resolution: ConflictAction | null;
}

export interface ImportErrorsResponse {
  items: ImportErrorRow[];
}

// ——— Conflict resolution ———

export interface ConflictDecision {
  errorId: string;
  action: ConflictAction;
}

export interface ResolveConflictsRequest {
  decisions: ConflictDecision[];
}

export interface ResolveConflictsResponse {
  uploadId: string;
  status: UploadStatus;
  rowsImported: number;
  rowsFailed: number;
  rowsConflicted: number;
}

// ——— History ———

export interface UploadHistoryItem {
  uploadId: string;
  originalFilename: string;
  status: UploadStatus;
  totalRowsDetected: number;
  rowsImported: number;
  rowsFailed: number;
  rowsConflicted: number;
  createdAt: string;
  completedAt: string | null;
}

export interface UploadHistoryResponse {
  items: UploadHistoryItem[];
  nextCursor: string | null;
}

// ——— Line Haul Trip (QR scan / list) ———

export interface LinehaulTripItemResponse {
  id: string;
  toNumber: string;
  weight: number | null;
  destination: string | null;
  dgType: string | null;
  toType: string | null;
}

export interface LinehaulTripResponse {
  id: string;
  tripCode: string;
  schedule: string | null;
  origin: string;
  destination: string;
  vendor: string | null;
  plateNumber: string | null;
  driverName: string | null;
  std: string | null;
  sta: string | null;
  ata: string | null;
  totalWeight: number | null;
  createdAt?: string;
  itemCount?: number;
}

export interface LinehaulLookupResponse {
  item: LinehaulTripItemResponse;
  trip: LinehaulTripResponse;
}

export interface LinehaulTripsListResponse {
  items: (LinehaulTripResponse & { itemCount: number; createdAt: string })[];
  nextCursor: string | null;
}

export interface LinehaulTripDetailResponse {
  trip: LinehaulTripResponse;
  items: LinehaulTripItemResponse[];
}
