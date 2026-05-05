import type { Metadata } from 'next';
import { AuthProvider } from '@/features/auth/auth.context';
import { QueryProvider } from '@/shared/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shipment Tracking System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
