import { cn } from '@/lib/utils';

export function BrandLogo({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] bg-brand font-extrabold tracking-[0.02em] text-white',
        size === 'md' ? 'h-[42px] w-[42px] text-xs' : 'h-8 w-8 text-[10px]',
        className,
      )}
    >
      ESP
    </span>
  );
}
