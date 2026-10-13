import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Plane } from 'lucide-react';
import { Button } from './button';
import { Badge } from './badge';
import { Card, CardHead } from './card';
import { StatusBadge } from '@/components/shared/status-badge';

describe('design primitives', () => {
  it('Button subtle and danger-soft variants', () => {
    render(<><Button variant="subtle">A</Button><Button variant="danger-soft">B</Button></>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-surface-2');
    expect(screen.getByRole('button', { name: 'B' })).toHaveClass('bg-bad-soft');
  });

  it('Badge status variants', () => {
    render(<><Badge variant="active">on</Badge><Badge variant="pending">wait</Badge></>);
    expect(screen.getByText('on')).toHaveClass('bg-good-soft');
    expect(screen.getByText('wait')).toHaveClass('bg-warn-soft');
  });

  it('StatusBadge maps onto token classes', () => {
    render(<StatusBadge variant="locked" />);
    expect(screen.getByText('Locked')).toHaveClass('bg-bad-soft');
  });

  it('CardHead renders title, subtitle and a toned icon', () => {
    render(<Card><CardHead icon={Plane} tone="info" title="Shipments" subtitle="Hari ini" /></Card>);
    expect(screen.getByRole('heading', { level: 2, name: 'Shipments' })).toHaveClass('font-display');
    expect(screen.getByText('Hari ini')).toBeInTheDocument();
    expect(screen.getByTestId('icon-square')).toHaveClass('bg-info');
  });
});
