import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ModeTabs, SubTabs } from './segmented';

const items = [{ value: 'air', label: 'Air' }, { value: 'sea', label: 'Sea' }] as const;

it('ModeTabs marks the active tab and reports changes', async () => {
  const onChange = jest.fn();
  render(<ModeTabs aria-label="Mode" value="air" onValueChange={onChange} items={[...items]} />);
  expect(screen.getByRole('tablist', { name: 'Mode' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Air' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.click(screen.getByRole('tab', { name: 'Sea' }));
  expect(onChange).toHaveBeenCalledWith('sea');
});

it('SubTabs uses the brand-ink active chip', () => {
  render(<SubTabs value="sea" onValueChange={() => {}} items={[...items]} />);
  expect(screen.getByRole('tab', { name: 'Sea' })).toHaveClass('bg-brand-ink');
});

it('moves selection and focus with arrow keys, one tab stop for the list', async () => {
  const onChange = jest.fn();
  render(<ModeTabs aria-label="Mode" value="air" onValueChange={onChange} items={[...items]} />);
  expect(screen.getByRole('tab', { name: 'Air' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('tab', { name: 'Sea' })).toHaveAttribute('tabindex', '-1');
  screen.getByRole('tab', { name: 'Air' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(onChange).toHaveBeenLastCalledWith('sea');
  expect(screen.getByRole('tab', { name: 'Sea' })).toHaveFocus();
  await userEvent.keyboard('{End}');
  expect(onChange).toHaveBeenLastCalledWith('sea');
});
