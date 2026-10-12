import * as React from 'react';
import { cn } from '@/lib/utils';

const TableWrap = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('overflow-x-auto rounded-md border bg-card', className)} {...props} />
  )
);
TableWrap.displayName = 'TableWrap';

const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full border-collapse text-[12.5px]', className)} {...props} />
  )
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn(className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child>td]:border-b-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('motion-safe:transition-colors [tbody_&]:hover:bg-row-hover', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

interface CellProps { num?: boolean }

// `sticky top-0` pins the header only while its own scroller scrolls: give the TableWrap a
// max height (e.g. `max-h-[70vh]`) for long tables, otherwise the header scrolls with the page.
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, num, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'sticky top-0 whitespace-nowrap border-b bg-table-head px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground first:pl-3.5',
        num && 'text-right',
        className,
      )}
      {...props}
    />
  )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, num, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('border-b px-2.5 py-[9px] text-xs text-foreground first:pl-3.5', num && 'tabular text-right', className)}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

export { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
