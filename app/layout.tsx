import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feeder · Your interests, your feed',
  description: 'A user-owned discovery feed and save-for-later workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
