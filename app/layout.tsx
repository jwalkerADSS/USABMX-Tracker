import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BMX Tracker', template: '%s · BMX Tracker' },
  description: 'USA BMX points, standings and race results for our riders.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'BMX Tracker', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1f3a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
