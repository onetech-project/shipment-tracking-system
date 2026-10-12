import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

it('styles header cells and right-aligns numeric cells', () => {
  render(
    <Table>
      <TableHeader><TableRow><TableHead>Rute</TableHead><TableHead num>GP</TableHead></TableRow></TableHeader>
      <TableBody><TableRow><TableCell>CGK</TableCell><TableCell num>1.000</TableCell></TableRow></TableBody>
    </Table>
  );
  expect(screen.getByRole('columnheader', { name: 'Rute' })).toHaveClass('uppercase', 'bg-table-head');
  expect(screen.getByRole('columnheader', { name: 'GP' })).toHaveClass('text-right');
  expect(screen.getByRole('cell', { name: '1.000' })).toHaveClass('text-right', 'tabular');
});
