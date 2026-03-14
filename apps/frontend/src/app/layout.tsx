import type { Metadata } from 'next';
import { AuthProvider } from '@/features/auth/auth.context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shipment Tracking System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
