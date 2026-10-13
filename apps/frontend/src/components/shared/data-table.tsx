import * as React from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';

export interface DataTableColumn<T> {
  // ReactNode, not string, so a sort control can live inside the header cell it sorts rather
  // than in a separate row above the table. Existing string headers stay valid.
  header: React.ReactNode;
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
    <TableWrap className={className}>
      <Table data-testid={testId}>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.className}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</td></tr>
          ) : (
            rows.map((row) => (
              <TableRow key={keyExtractor(row)} data-testid={rowDataTestId}>
                {columns.map((col, i) => (
                  <TableCell key={i} className={cn(col.className)}>{col.accessor(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
