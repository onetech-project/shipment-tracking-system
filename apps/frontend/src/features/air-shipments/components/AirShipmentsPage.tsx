'use client';
import { useAirShipments } from '@/features/air-shipments/hooks/useAirShipments';
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification';
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable';
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge';
import { TableSkeleton } from '@/features/air-shipments/components/TableSkeleton';
import { SortOrder } from '@/features/air-shipments/types';

interface AirShipmentsPageProps {
  endpoint: string;
  tableName: string;
  title: string;
  defaultSortBy?: string;
}

export function AirShipmentsPage({ endpoint, tableName, title, defaultSortBy = 'date' }: AirShipmentsPageProps) {
  const { isConnected, lastSyncAt, affectedTables } = useSyncNotification();
  const { data, isLoading, query, setPage, setSort } = useAirShipments(endpoint, tableName, affectedTables, defaultSortBy);

  const handleSort = (col: string, order: SortOrder) => setSort(col, order);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
      </div>

      {isLoading && !data ? (
        <TableSkeleton />
      ) : data ? (
        <AirShipmentTable
          data={data.data}
          meta={data.meta}
          sortBy={query.sortBy}
          sortOrder={query.sortOrder}
          onSort={handleSort}
          onPageChange={setPage}
          tableName={tableName}
        />
      ) : null}
    </div>
  );
}
