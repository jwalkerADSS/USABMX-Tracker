import type { Metadata, Viewport } from 'next';
import './globals.css';
import { InstallApp } from './install-app';
import { SessionCheck } from './session-check';
import { UpdateBanner } from './update-banner';

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

// Caught before the page's scripts load, since Chrome can offer the install prompt early (see install-app.tsx).
const CATCH_INSTALL_PROMPT =
  "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: CATCH_INSTALL_PROMPT }} />
        <UpdateBanner />
        <SessionCheck />
        {children}
        <InstallApp />
      </body>
    </html>
  );
}
