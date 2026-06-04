import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  className?: string;
  labelExtra?: React.ReactNode;
  children: React.ReactElement;
}

export function FormField({ label, error, required, hint, htmlFor, className, labelExtra, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="flex items-center gap-1 text-sm font-medium leading-none" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-0.5" aria-hidden="true">*</span>}
        {labelExtra}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <span className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}
