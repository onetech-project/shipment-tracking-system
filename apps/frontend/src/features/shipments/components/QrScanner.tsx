'use client'
import { useQrScanner } from '../hooks/useQrScanner'
import ShipmentDetail from './ShipmentDetail'
import LinehaulDetail from './LinehaulDetail'

export default function QrScanner() {
  const { permissionState, scanResult, isLooking, videoRef, canvasRef, startScanner, reset } =
    useQrScanner()

  return (
    <div>
      {permissionState === 'idle' && (
        <div>
          <p style={{ color: '#64748b' }}>
            Click the button below to allow camera access and scan a shipment QR code.
          </p>
          <button
            data-testid="start-scanner"
            onClick={startScanner}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.5rem',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Allow Camera &amp; Start Scanner
          </button>
        </div>
      )}

      {permissionState === 'prompt' && (
        <div
          data-testid="permission-prompt"
          style={{ color: '#64748b', padding: '1rem', textAlign: 'center' }}
        >
          <p>Requesting camera permission…</p>
        </div>
      )}

      {permissionState === 'denied' && (
        <div
          data-testid="permission-denied"
          style={{ color: '#ef4444', padding: '1rem', background: '#fef2f2', borderRadius: 8 }}
        >
          <strong>Camera access denied.</strong>
          <p>
            Please enable camera access in your browser settings, then{' '}
            <button
              onClick={reset}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              try again
            </button>
            .
          </p>
        </div>
      )}

      {permissionState === 'no-camera' && (
        <div
          data-testid="no-camera"
          style={{ color: '#f59e0b', padding: '1rem', background: '#fffbeb', borderRadius: 8 }}
        >
          <strong>No camera found.</strong>
          <p>Please connect a camera and try again.</p>
        </div>
      )}

      {permissionState === 'in-use' && (
        <div
          data-testid="camera-in-use"
          style={{ color: '#f59e0b', padding: '1rem', background: '#fffbeb', borderRadius: 8 }}
        >
          <strong>Camera is already in use</strong> by another application.
          <p>
            Close other apps using the camera and{' '}
            <button
              onClick={startScanner}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              try again
            </button>
            .
          </p>
        </div>
      )}

      {permissionState === 'granted' && (
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div
            data-testid="scanner-status"
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              borderRadius: 4,
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              textAlign: 'center',
            }}
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
        <div data-testid="shipment-not-found" style={{ marginTop: '1rem', color: '#ef4444' }}>
          <strong>Not found:</strong> <code>{scanResult.value}</code>
          <br />
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              color: '#3b82f6',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Scan again
          </button>
        </div>
      )}

      {scanResult?.type === 'invalid-format' && (
        <div data-testid="invalid-qr-format" style={{ marginTop: '1rem', color: '#f59e0b' }}>
          <strong>Unrecognised QR code:</strong> <code>{scanResult.raw}</code>
          <br />
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              color: '#3b82f6',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Scan again
          </button>
        </div>
      )}

      {scanResult?.type === 'scan-error' && (
        <div data-testid="scan-error" style={{ marginTop: '1rem', color: '#ef4444', background: '#fef2f2', padding: '0.75rem', borderRadius: 6 }}>
          <strong>Error:</strong> {scanResult.message}
          <br />
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              color: '#3b82f6',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
