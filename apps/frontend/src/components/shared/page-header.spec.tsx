import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PageHeader } from './page-header';
import { LiveBadge, StagingBadge } from './header-badges';

describe('PageHeader', () => {
  it('renders title as h1 in the display font', () => {
    render(<PageHeader title="P&L Analysis" subtitle="Ringkasan" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'P&L Analysis' });
    expect(h1).toHaveClass('font-display');
    expect(screen.getByText('Ringkasan')).toBeInTheDocument();
  });

  it('renders a badge next to the title and actions on the right', () => {
    render(<PageHeader title="SLA" badge={<StagingBadge />} action={<button>Export</button>} />);
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('LiveBadge defaults its label to Live', () => {
    render(<LiveBadge />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
