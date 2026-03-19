'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import jsQR from 'jsqr';
import type { ShipmentResponse, LinehaulLookupResponse } from '@shared/shipments';
import { lookupShipment, lookupLinehaulItem } from '../api/shipments.api';

export type ScannerPermissionState = 'idle' | 'granted' | 'denied' | 'no-camera' | 'in-use';

export type ScanResult =
  | { type: 'shipment'; shipment: ShipmentResponse }
  | { type: 'linehaul'; linehaul: LinehaulLookupResponse }
  | { type: 'not-found'; value: string }
  | { type: 'invalid-format'; raw: string }
  | null;

// Keep backward-compat alias
export type { ScanResult as QrScanResult };

const SHIPMENT_ID_REGEX = /^[A-Z0-9-]{6,40}$/;
const SCAN_COOLDOWN_MS = 800;
const ID_COOLDOWN_MS = 5000;

function extractShipmentId(decoded: string): string {
  // Accept URL payloads like https://example.com/scan?id=SHP-001
  try {
    const url = new URL(decoded);
    const idParam = url.searchParams.get('id') ?? url.searchParams.get('shipmentId');
    if (idParam) return idParam.trim();
  } catch {
    // Not a URL — use raw value
  }
  return decoded.trim();
}

export interface UseQrScanner {
  permissionState: ScannerPermissionState;
  scanResult: ScanResult;
  isLooking: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  startScanner: () => Promise<void>;
  stopScanner: () => void;
  reset: () => void;
}

export function useQrScanner(): UseQrScanner {
  const [permissionState, setPermissionState] = useState<ScannerPermissionState>('idle');
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [isLooking, setIsLooking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastIdRef = useRef<Map<string, number>>(new Map());

  const stopScanner = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  // Listen for mock scan events used in Playwright tests
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      void handleDecode(custom.detail);
    };
    window.addEventListener('__mock_qr_scan', handler);
    return () => window.removeEventListener('__mock_qr_scan', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecode(decoded: string) {
    const id = extractShipmentId(decoded);

    if (!SHIPMENT_ID_REGEX.test(id)) {
      setScanResult({ type: 'invalid-format', raw: decoded });
      return;
    }

    // Per-ID cooldown to avoid hammering the API on repeated scans
    const now = Date.now();
    const last = lastIdRef.current.get(id) ?? 0;
    if (now - last < ID_COOLDOWN_MS) return;
    lastIdRef.current.set(id, now);

    setIsLooking(true);
    try {
      // Try linehaul lookup first
      try {
        const linehaul = await lookupLinehaulItem(id);
        setScanResult({ type: 'linehaul', linehaul });
        return;
      } catch (lhErr: unknown) {
        const lhStatus = (lhErr as any)?.response?.status;
        if (lhStatus !== 404 && lhStatus !== 400) {
          // Unexpected error — don't fall through
          setScanResult({ type: 'not-found', value: id });
          return;
        }
      }

      // Fall back to shipment lookup
      const shipment = await lookupShipment(id);
      setScanResult({ type: 'shipment', shipment });
    } catch (err: unknown) {
      const status = (err as any)?.response?.status;
      if (status === 404) {
        setScanResult({ type: 'not-found', value: id });
      } else if (status === 400) {
        setScanResult({ type: 'invalid-format', raw: id });
      } else {
        setScanResult({ type: 'not-found', value: id });
      }
    } finally {
      setIsLooking(false);
    }
  }

  function decode() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(decode);
      return;
    }

    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) {
      rafRef.current = requestAnimationFrame(decode);
      return;
    }
    lastScanRef.current = now;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(decode);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      void handleDecode(code.data);
    }

    rafRef.current = requestAnimationFrame(decode);
  }

  const startScanner = useCallback(async () => {
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setPermissionState('granted');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(decode);
    } catch (err: unknown) {
      stopScanner();
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setPermissionState('denied');
      } else if (name === 'NotFoundError') {
        setPermissionState('no-camera');
      } else if (name === 'NotReadableError') {
        setPermissionState('in-use');
      } else {
        setPermissionState('denied');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanner]);

  const reset = useCallback(() => {
    stopScanner();
    setScanResult(null);
    setPermissionState('idle');
    setIsLooking(false);
  }, [stopScanner]);

  return { permissionState, scanResult, isLooking, videoRef, canvasRef, startScanner, stopScanner, reset };
}
