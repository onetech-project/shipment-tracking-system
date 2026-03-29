'use client'
import { Button } from '@/components/ui/button'
import { useQrScanner } from '../hooks/useQrScanner'
import ShipmentDetail from './ShipmentDetail'
import LinehaulDetail from './LinehaulDetail'

export default function QrScanner() {
  const { permissionState, scanResult, isLooking, videoRef, canvasRef, startScanner, reset } =
    useQrScanner()

  return (
    <div className="space-y-4">
      {permissionState === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Click the button below to allow camera access and scan a shipment QR code.
          </p>
          <Button data-testid="start-scanner" onClick={startScanner}>
            Allow Camera &amp; Start Scanner
          </Button>
        </div>
      )}

      {permissionState === 'prompt' && (
        <div
          data-testid="permission-prompt"
          className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground"
        >
          <p>Requesting camera permission…</p>
        </div>
      )}

      {permissionState === 'denied' && (
        <div
          data-testid="permission-denied"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <strong>Camera access denied.</strong>
          <p className="mt-1">
            Please enable camera access in your browser settings, then{' '}
            <Button variant="link" className="h-auto p-0" onClick={reset}>
              try again
            </Button>
            .
          </p>
        </div>
      )}

      {permissionState === 'no-camera' && (
        <div
          data-testid="no-camera"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700"
        >
          <strong>No camera found.</strong>
          <p className="mt-1">Please connect a camera and try again.</p>
        </div>
      )}

      {permissionState === 'in-use' && (
        <div
          data-testid="camera-in-use"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700"
        >
          <strong>Camera is already in use</strong> by another application.
          <p className="mt-1">
            Close other apps using the camera and{' '}
            <Button variant="link" className="h-auto p-0" onClick={startScanner}>
              try again
            </Button>
            .
          </p>
        </div>
      )}

      {permissionState === 'granted' && (
        <div className="relative max-w-md">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full rounded-lg bg-black"
          />
          <canvas ref={canvasRef} className="hidden" />

          <div
            data-testid="scanner-status"
            className="absolute bottom-2 left-2 right-2 rounded bg-black/50 px-2 py-1 text-center text-xs text-white"
          >
            {isLooking ? 'Looking up shipment…' : 'Point camera at a QR code'}
          </div>
        </div>
      )}

      {/* Scan results */}
      {scanResult?.type === 'shipment' && (
        <ShipmentDetail shipment={scanResult.shipment} onReset={reset} />
      )}

      {scanResult?.type === 'linehaul' && (
        <LinehaulDetail data={scanResult.linehaul} onReset={reset} />
      )}

      {scanResult?.type === 'not-found' && (
        <div data-testid="shipment-not-found" className="mt-4 space-y-2 text-sm text-destructive">
          <p><strong>Not found:</strong> <code className="bg-muted px-1 rounded">{scanResult.value}</code></p>
          <Button variant="link" className="h-auto p-0" onClick={reset}>Scan again</Button>
        </div>
      )}

      {scanResult?.type === 'invalid-format' && (
        <div data-testid="invalid-qr-format" className="mt-4 space-y-2 text-sm text-amber-700">
          <p><strong>Unrecognised QR code:</strong> <code className="bg-muted px-1 rounded">{scanResult.raw}</code></p>
          <Button variant="link" className="h-auto p-0" onClick={reset}>Scan again</Button>
        </div>
      )}

      {scanResult?.type === 'scan-error' && (
        <div data-testid="scan-error" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-2">
          <p><strong>Error:</strong> {scanResult.message}</p>
          <Button variant="link" className="h-auto p-0" onClick={reset}>Try again</Button>
        </div>
      )}
    </div>
  )
}
