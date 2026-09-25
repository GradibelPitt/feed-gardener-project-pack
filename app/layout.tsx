import type { Metadata } from 'next';
import MotionRoot from '@/components/MotionRoot';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feeder · Your interests, your feed',
  description: 'A user-owned discovery feed and save-for-later workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
