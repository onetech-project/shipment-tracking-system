'use client';
import type { ShipmentResponse } from '@shared/shipments';

interface ShipmentDetailProps {
  shipment: ShipmentResponse;
  onReset?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  in_transit: '#3b82f6',
  delivered: '#22c55e',
  cancelled: '#ef4444',
};

export default function ShipmentDetail({ shipment, onReset }: ShipmentDetailProps) {
  const color = STATUS_COLORS[shipment.status] ?? '#94a3b8';

  return (
    <div
      data-testid="shipment-detail"
      style={{
        marginTop: '1.5rem',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '1.5rem',
        maxWidth: 480,
        background: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontFamily: 'monospace' }}>{shipment.shipmentId}</h3>
        <span
          style={{
            background: color,
            color: '#fff',
            padding: '0.2rem 0.6rem',
            borderRadius: 4,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {shipment.status.replace('_', ' ')}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.25rem 0', color: '#64748b', width: '40%' }}>Origin</td>
            <td style={{ padding: '0.25rem 0' }}>{shipment.origin}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Destination</td>
            <td style={{ padding: '0.25rem 0' }}>{shipment.destination}</td>
          </tr>
          {shipment.carrier && (
            <tr>
              <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Carrier</td>
              <td style={{ padding: '0.25rem 0' }}>{shipment.carrier}</td>
            </tr>
          )}
          {shipment.estimatedDeliveryDate && (
            <tr>
              <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Est. Delivery</td>
              <td style={{ padding: '0.25rem 0' }}>{shipment.estimatedDeliveryDate}</td>
            </tr>
          )}
          {shipment.contentsDescription && (
            <tr>
              <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Contents</td>
              <td style={{ padding: '0.25rem 0' }}>{shipment.contentsDescription}</td>
            </tr>
          )}
        </tbody>
      </table>

      {onReset && (
        <button
          onClick={onReset}
          style={{
            marginTop: '1rem',
            background: 'none',
            border: '1px solid #cbd5e1',
            padding: '0.4rem 1rem',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#475569',
          }}
        >
          Scan another
        </button>
      )}
    </div>
  );
}
