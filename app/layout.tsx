import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/src/ui/SiteHeader';

export const metadata: Metadata = {
  title: 'Ottodot — Trial Booking',
  description: 'Book a trial class.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 px-4 py-10 text-slate-900 antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
