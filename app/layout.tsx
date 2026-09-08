import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ottodot — Trial Booking',
  description: 'Book a trial class.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 px-4 py-10 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
