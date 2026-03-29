import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  className?: string;
  'data-testid'?: string;
  rowDataTestId?: string;
}

export function DataTable<T>({
  columns, rows, keyExtractor, emptyMessage = 'No records found.',
  isLoading = false, className, 'data-testid': testId, rowDataTestId,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-md border', className)}>
      <table data-testid={testId} className="w-full border-collapse">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={cn('px-4 py-3 text-left text-sm font-medium text-muted-foreground', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</td></tr>
          ) : (
            rows.map((row) => (
              <tr key={keyExtractor(row)} data-testid={rowDataTestId} className="hover:bg-muted/30 motion-safe:transition-colors motion-safe:duration-150">
                {columns.map((col, i) => (
                  <td key={i} className={cn('px-4 py-3 text-sm', col.className)}>{col.accessor(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
