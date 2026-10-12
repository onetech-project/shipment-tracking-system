import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Wallet } from 'lucide-react';
import { KpiCard, KpiGrid } from './kpi-card';

it('renders label, value, hint and an up delta', () => {
  render(<KpiGrid cols={4}><KpiCard label="Revenue" value="Rp 6,13 M" hint="vs lalu" delta={{ dir: 'up', text: '8.2%' }} icon={Wallet} /></KpiGrid>);
  expect(screen.getByText('Revenue')).toBeInTheDocument();
  expect(screen.getByText('Rp 6,13 M')).toHaveClass('font-display', 'tabular');
  expect(screen.getByText(/8\.2%/)).toHaveClass('bg-good-soft');
});

it('is a button when clickable', () => {
  render(<KpiCard label="Breach" value="3" onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /breach/i })).toBeInTheDocument();
});
