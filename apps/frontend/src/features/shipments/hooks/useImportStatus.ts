'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { ImportStatusResponse, ImportErrorsResponse, ConflictDecision } from '@shared/shipments';
import { uploadPdf, getImportStatus, getImportErrors, resolveConflicts } from '../api/shipments.api';

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed']);
const POLL_INTERVAL_MS = 2000;

export interface UseImportStatus {
  upload: (file: File) => Promise<void>;
  status: ImportStatusResponse | null;
  errors: ImportErrorsResponse | null;
  resolve: (decisions: ConflictDecision[]) => Promise<void>;
  isUploading: boolean;
  isPending: boolean;
  error: string | null;
}

export function useImportStatus(): UseImportStatus {
  const [status, setStatus] = useState<ImportStatusResponse | null>(null);
  const [errors, setErrors] = useState<ImportErrorsResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (uploadId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const s = await getImportStatus(uploadId);
          setStatus(s);
          if (TERMINAL_STATUSES.has(s.status) || s.status === 'awaiting_conflict_review') {
            stopPolling();
            const errs = await getImportErrors(uploadId);
            setErrors(errs);
          }
        } catch {
          stopPolling();
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);
      setStatus(null);
      setErrors(null);
      try {
        const res = await uploadPdf(file);
        uploadIdRef.current = res.uploadId;
        setStatus({ uploadId: res.uploadId, originalFilename: file.name, status: 'queued', totalRowsDetected: 0, rowsImported: 0, rowsFailed: 0, rowsConflicted: 0, startedAt: null, completedAt: null, durationMs: null });
        startPolling(res.uploadId);
      } catch (err: unknown) {
        setError((err as Error).message ?? 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [startPolling],
  );

  const resolve = useCallback(async (decisions: ConflictDecision[]) => {
    const uploadId = uploadIdRef.current;
    if (!uploadId) return;
    const result = await resolveConflicts(uploadId, { decisions });
    setStatus((prev) => prev ? { ...prev, status: result.status, rowsImported: result.rowsImported, rowsFailed: result.rowsFailed, rowsConflicted: result.rowsConflicted } : prev);
  }, []);

  const isPending = status !== null && !TERMINAL_STATUSES.has(status.status) && status.status !== 'awaiting_conflict_review';

  return { upload, status, errors, resolve, isUploading, isPending, error };
}
