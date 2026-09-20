/**
 * The permission gate is the reason this has its own spec. GET /route-groups is guarded by
 * read.route_group, so a viewer allowed onto the P&L tabs but not onto Route Groups must not
 * merely have the control hidden — no request may be sent at all, or they collect a 403.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RouteGroupSelect } from './route-group-select';

jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: jest.fn() }));
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({ useRouteGroups: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const perms = require('@/shared/hooks/use-permissions');
const groupsHook = require('@/features/route-groups/hooks/useRouteGroups');
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const GROUPS = [
  { id: 'g1', name: 'Jabo Timur', description: null, routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }] },
  { id: 'g2', name: 'Surabaya', description: null, routes: [] },
];

function allow(can: boolean) {
  perms.usePermissions.mockReturnValue({ hasPermission: () => can });
}

beforeEach(() => {
  jest.clearAllMocks();
  groupsHook.useRouteGroups.mockReturnValue({ data: GROUPS });
});

describe('RouteGroupSelect', () => {
  it('lists every group behind a placeholder', () => {
    allow(true);
    render(<RouteGroupSelect value={undefined} onChange={jest.fn()} />);

    expect(screen.getByRole('option', { name: 'Route group…' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Jabo Timur' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Surabaya' })).toBeInTheDocument();
  });

  it('reports the chosen group id', () => {
    allow(true);
    const onChange = jest.fn();
    render(<RouteGroupSelect value={undefined} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'g1' } });
    expect(onChange).toHaveBeenCalledWith('g1');
  });

  it('reports undefined, not an empty string, when the placeholder is chosen', () => {
    // undefined is what "no group" means everywhere downstream; '' would be a group id nothing
    // matches, and offerableRoutes would then withhold nothing while the label claimed otherwise.
    allow(true);
    const onChange = jest.fn();
    render(<RouteGroupSelect value="g1" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows the placeholder for a group id that no longer exists', () => {
    // A group deleted while the user was on another tab. Falling back to the placeholder is the
    // honest answer; the scope simply falls back to the hand-picked routes.
    allow(true);
    render(<RouteGroupSelect value="deleted" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('does fetch the groups when the permission is present', () => {
    // The negative case below pins enabled:false, but nothing pinned the positive one — and the
    // shared mockReturnValue ignores call arguments, so a source that hardcoded enabled:false
    // would render the control and simply never fetch, leaving the dropdown silently empty.
    allow(true);
    render(<RouteGroupSelect value={undefined} onChange={jest.fn()} />);

    expect(groupsHook.useRouteGroups).toHaveBeenCalledWith({ enabled: true });
  });

  it('renders nothing and asks for nothing without read.route_group', () => {
    allow(false);
    const { container } = render(<RouteGroupSelect value={undefined} onChange={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(groupsHook.useRouteGroups).toHaveBeenCalledWith({ enabled: false });
  });
});
