'use client';
import type { LinehaulLookupResponse } from '@shared/shipments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LinehaulDetailProps {
  data: LinehaulLookupResponse;
  onReset?: () => void;
}

export default function LinehaulDetail({ data, onReset }: LinehaulDetailProps) {
  const { item, trip } = data;

  return (
    <Card data-testid="linehaul-detail" className="mt-6 max-w-md shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-base">{item.toNumber}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trip Item */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {item.weight != null && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground w-2/5">Weight</td>
                  <td className="px-4 py-2">{item.weight}</td>
                </tr>
              )}
              {item.destination && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">Destination</td>
                  <td className="px-4 py-2">{item.destination}</td>
                </tr>
              )}
              {item.dgType && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">DG Type</td>
                  <td className="px-4 py-2">{item.dgType}</td>
                </tr>
              )}
              {item.toType && (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground">TO Type</td>
                  <td className="px-4 py-2">{item.toType}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Parent Trip */}
        <details data-testid="linehaul-trip-header" className="border rounded-md">
          <summary className="cursor-pointer px-4 py-2 font-semibold text-sm select-none hover:bg-muted/30 motion-safe:transition-colors">
            Trip: {trip.tripCode}
          </summary>
          <div className="border-t overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {trip.schedule && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground w-2/5">Schedule</td>
                    <td className="px-4 py-2">{trip.schedule}</td>
                  </tr>
                )}
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">Origin</td>
                  <td className="px-4 py-2">{trip.origin}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">Destination</td>
                  <td className="px-4 py-2">{trip.destination}</td>
                </tr>
                {trip.vendor && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">Vendor</td>
                    <td className="px-4 py-2">{trip.vendor}</td>
                  </tr>
                )}
                {trip.plateNumber && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">Plate Number</td>
                    <td className="px-4 py-2">{trip.plateNumber}</td>
                  </tr>
                )}
                {trip.driverName && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">Driver</td>
                    <td className="px-4 py-2">{trip.driverName}</td>
                  </tr>
                )}
                {trip.std && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">STD</td>
                    <td className="px-4 py-2">{new Date(trip.std).toLocaleString()}</td>
                  </tr>
                )}
                {trip.sta && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">STA</td>
                    <td className="px-4 py-2">{new Date(trip.sta).toLocaleString()}</td>
                  </tr>
                )}
                {trip.ata && (
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">ATA</td>
                    <td className="px-4 py-2">{new Date(trip.ata).toLocaleString()}</td>
                  </tr>
                )}
                {trip.totalWeight != null && (
                  <tr>
                    <td className="px-4 py-2 text-muted-foreground">Total Weight</td>
                    <td className="px-4 py-2">{trip.totalWeight}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>

        {onReset && (
          <Button data-testid="scan-again-button" variant="outline" onClick={onReset}>
            Scan Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

