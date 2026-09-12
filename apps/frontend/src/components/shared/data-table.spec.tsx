import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataTable, DataTableColumn } from './data-table';

type Row = { id: string; nama: string };

const rows: Row[] = [
  { id: '1', nama: 'Ahmad' },
  { id: '2', nama: 'Budi' },
];

const renderTable = (over: Record<string, unknown> = {}) =>
  render(
    <DataTable<Row>
      columns={[{ header: 'Nama', accessor: (r) => r.nama }]}
      rows={rows}
      keyExtractor={(r) => r.id}
      {...over}
    />
  );

describe('DataTable', () => {
  it('renders a plain string header', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Nama' })).toBeInTheDocument();
  });

  // The sort control belongs inside the header cell it sorts. While header was typed as string
  // it had to live in a separate row above the table, which left the two visually unconnected.
  it('renders an element header, controls and all', () => {
    // Annotated as DataTableColumn<Row>[] on purpose. ts-jest runs transpile-only here, and the
    // spread through renderTable's Record<string, unknown> erases the type either way, so an
    // inline literal would compile happily against header: string and prove nothing. This
    // annotation is what makes `pnpm type-check` the gate on the widening.
    const columns: DataTableColumn<Row>[] = [
      {
        header: (
          <button type="button" onClick={() => {}}>
            Nopol ▲
          </button>
        ),
        accessor: (r) => r.nama,
      },
    ];
    renderTable({ columns });
    expect(screen.getByRole('button', { name: /nopol/i })).toBeInTheDocument();
  });

  it('renders one row per record', () => {
    renderTable({ rowDataTestId: 'row' });
    expect(screen.getAllByTestId('row')).toHaveLength(2);
  });

  it('shows the empty message when there are no rows', () => {
    renderTable({ rows: [], emptyMessage: 'Belum ada data.' });
    expect(screen.getByText('Belum ada data.')).toBeInTheDocument();
  });

  it('shows a loading state rather than the empty message', () => {
    renderTable({ rows: [], isLoading: true, emptyMessage: 'Belum ada data.' });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Belum ada data.')).not.toBeInTheDocument();
  });
});
