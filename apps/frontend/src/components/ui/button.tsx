import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-sm text-[13px] font-medium ring-offset-background motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border border-primary bg-primary font-semibold text-primary-foreground hover:border-brand-hover hover:bg-brand-hover',
        destructive: 'bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card text-foreground hover:border-border-strong hover:bg-surface-2',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[#e3ede3]',
        ghost: 'hover:bg-surface-2 hover:text-foreground',
        link: 'text-brand-2 underline-offset-4 hover:text-brand-ink hover:underline',
        subtle: 'border border-transparent bg-surface-2 text-muted-foreground hover:bg-[#e3ede3] hover:text-foreground',
        'danger-soft': 'border border-[#fecaca] bg-bad-soft text-bad hover:bg-[#fecaca]',
        'ghost-dark': 'border border-white/15 bg-white/10 text-white hover:bg-white/[.18]',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
