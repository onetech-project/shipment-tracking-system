'use client';
import type { ShipmentResponse } from '@shared/shipments';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';

interface ShipmentDetailProps {
  shipment: ShipmentResponse;
  onReset?: () => void;
}

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'pending',
  in_transit: 'active',
  delivered: 'success',
  cancelled: 'error',
};

export default function ShipmentDetail({ shipment, onReset }: ShipmentDetailProps) {
  const variant = STATUS_VARIANT[shipment.status] ?? 'pending';

  return (
    <Card data-testid="shipment-detail" className="mt-6 max-w-md shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <code className="text-base font-bold">{shipment.shipmentId}</code>
        <StatusBadge variant={variant} label={shipment.status.replace('_', ' ')} />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="px-4 py-2 text-muted-foreground w-2/5">Origin</td>
                <td className="px-4 py-2">{shipment.origin}</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2 text-muted-foreground">Destination</td>
                <td className="px-4 py-2">{shipment.destination}</td>
              </tr>
              {shipment.carrier && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">Carrier</td>
                  <td className="px-4 py-2">{shipment.carrier}</td>
                </tr>
              )}
              {shipment.estimatedDeliveryDate && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-muted-foreground">Est. Delivery</td>
                  <td className="px-4 py-2">{shipment.estimatedDeliveryDate}</td>
                </tr>
              )}
              {shipment.contentsDescription && (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground">Contents</td>
                  <td className="px-4 py-2">{shipment.contentsDescription}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {onReset && (
          <Button variant="outline" onClick={onReset} className="mt-4">
            Scan another
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
