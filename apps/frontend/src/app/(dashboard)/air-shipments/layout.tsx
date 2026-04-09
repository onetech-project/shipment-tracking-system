'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const subLinks = [
  { href: '/air-shipments/cgk', label: 'CGK' },
  { href: '/air-shipments/sub', label: 'SUB' },
  { href: '/air-shipments/sda', label: 'SDA' },
  { href: '/air-shipments/rate', label: 'Rate' },
  { href: '/air-shipments/routes', label: 'Routes' },
];

export default function AirShipmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Air Shipments</h1>
        <nav className="mt-3 flex gap-1 border-b">
          {subLinks.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
