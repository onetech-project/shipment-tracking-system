import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

const setup = (onPick = jest.fn()) => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Aksi">⋮</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onPick}>Ubah</DropdownMenuItem>
        <DropdownMenuItem>Arsipkan</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return { onPick };
};

// Radix opens the menu from `pointerdown`, not `click`, and guards on `button === 0`.
// fireEvent.click dispatches only a click event, so it leaves the menu shut -- the trigger has to
// be driven with a real pointerdown carrying button 0.
const openMenu = () =>
  fireEvent(
    screen.getByLabelText('Aksi'),
    new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
  );

describe('DropdownMenu', () => {
  // Closed by default: a table of 25 rows would otherwise render 25 open menus on top of each
  // other.
  it('keeps its items hidden until the trigger is used', () => {
    setup();
    expect(screen.queryByText('Ubah')).not.toBeInTheDocument();
  });

  it('shows the items when the trigger is clicked', () => {
    setup();
    openMenu();
    expect(screen.getByText('Ubah')).toBeInTheDocument();
    expect(screen.getByText('Arsipkan')).toBeInTheDocument();
  });

  it('calls the handler for the item that was chosen', () => {
    const { onPick } = setup();
    openMenu();
    fireEvent.click(screen.getByText('Ubah'));
    expect(onPick).toHaveBeenCalled();
  });

  // The menu is the only place some actions live, so it has to be reachable without a mouse.
  it('opens from the keyboard', () => {
    setup();
    const trigger = screen.getByLabelText('Aksi');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByText('Ubah')).toBeInTheDocument();
  });
});
