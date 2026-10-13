import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// The one field style every non-<Input> control (hand-rolled selects, textareas, date/number
// inputs) matches, so the whole app reads as one field style instead of several. `flex w-full`
// is deliberately left out here — some callers (e.g. a select inside a flex row with its own
// explicit width) don't want it — and added back on Input itself below.
export const fieldClass =
  'h-8 rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:font-normal placeholder:text-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn('flex w-full', fieldClass, className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
