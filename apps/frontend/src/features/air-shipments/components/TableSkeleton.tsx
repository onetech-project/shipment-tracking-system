export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-head">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="border-b px-2.5 py-2.5">
                <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="border-b px-2.5 py-[9px]">
                  <div className="h-3 w-full animate-pulse rounded-sm bg-surface-2 opacity-60" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
