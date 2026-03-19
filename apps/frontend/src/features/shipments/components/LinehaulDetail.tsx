'use client';
import type { LinehaulLookupResponse } from '@shared/shipments';

interface LinehaulDetailProps {
  data: LinehaulLookupResponse;
  onReset?: () => void;
}

export default function LinehaulDetail({ data, onReset }: LinehaulDetailProps) {
  const { item, trip } = data;

  return (
    <div
      data-testid="linehaul-detail"
      style={{
        marginTop: '1.5rem',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '1.5rem',
        maxWidth: 480,
        background: '#f8fafc',
      }}
    >
      {/* Trip Item Card */}
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'monospace' }}>{item.toNumber}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {item.weight != null && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b', width: '40%' }}>Weight</td>
                <td style={{ padding: '0.25rem 0' }}>{item.weight}</td>
              </tr>
            )}
            {item.destination && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Destination</td>
                <td style={{ padding: '0.25rem 0' }}>{item.destination}</td>
              </tr>
            )}
            {item.dgType && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>DG Type</td>
                <td style={{ padding: '0.25rem 0' }}>{item.dgType}</td>
              </tr>
            )}
            {item.toType && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>TO Type</td>
                <td style={{ padding: '0.25rem 0' }}>{item.toType}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Parent Trip Header (collapsible) */}
      <details data-testid="linehaul-trip-header" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
          Trip: {trip.tripCode}
        </summary>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <tbody>
            {trip.schedule && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b', width: '40%' }}>Schedule</td>
                <td style={{ padding: '0.25rem 0' }}>{trip.schedule}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Origin</td>
              <td style={{ padding: '0.25rem 0' }}>{trip.origin}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Destination</td>
              <td style={{ padding: '0.25rem 0' }}>{trip.destination}</td>
            </tr>
            {trip.vendor && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Vendor</td>
                <td style={{ padding: '0.25rem 0' }}>{trip.vendor}</td>
              </tr>
            )}
            {trip.plateNumber && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Plate Number</td>
                <td style={{ padding: '0.25rem 0' }}>{trip.plateNumber}</td>
              </tr>
            )}
            {trip.driverName && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Driver</td>
                <td style={{ padding: '0.25rem 0' }}>{trip.driverName}</td>
              </tr>
            )}
            {trip.std && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>STD</td>
                <td style={{ padding: '0.25rem 0' }}>{new Date(trip.std).toLocaleString()}</td>
              </tr>
            )}
            {trip.sta && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>STA</td>
                <td style={{ padding: '0.25rem 0' }}>{new Date(trip.sta).toLocaleString()}</td>
              </tr>
            )}
            {trip.ata && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>ATA</td>
                <td style={{ padding: '0.25rem 0' }}>{new Date(trip.ata).toLocaleString()}</td>
              </tr>
            )}
            {trip.totalWeight != null && (
              <tr>
                <td style={{ padding: '0.25rem 0', color: '#64748b' }}>Total Weight</td>
                <td style={{ padding: '0.25rem 0' }}>{trip.totalWeight}</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>

      {onReset && (
        <button
          data-testid="scan-again-button"
          onClick={onReset}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Scan Again
        </button>
      )}
    </div>
  );
}
