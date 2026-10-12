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

it('wraps a long value instead of overflowing, and shrinks at the 6-col breakpoint', () => {
  render(<KpiCard label="Revenue" value="Rp 123.456.789.012" />);
  expect(screen.getByText('Rp 123.456.789.012')).toHaveClass('break-words', '2xl:text-lg');
});

it('only sets aria-pressed when the card is clickable', () => {
  render(<KpiCard label="Breach" value="3" onClick={() => {}} selected />);
  expect(screen.getByRole('button', { name: /breach/i })).toHaveAttribute('aria-pressed', 'true');

  render(<KpiCard label="Static" value="3" selected data-testid="static-kpi" />);
  expect(screen.getByTestId('static-kpi')).not.toHaveAttribute('aria-pressed');
});

it('rings a selected card and forwards iconClassName to the icon square', () => {
  render(<KpiCard label="Revenue" value="1" icon={Wallet} iconClassName="bg-[#2d7a4a]" onClick={() => {}} selected />);
  const button = screen.getByRole('button', { name: /revenue/i });
  expect(button).toHaveClass('ring-2', 'ring-brand');
  expect(screen.getByTestId('icon-square')).toHaveClass('bg-[#2d7a4a]');
});
