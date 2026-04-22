import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '../components/NavBar';
import { Footer } from '../components/Footer';

export const metadata: Metadata = {
  title: 'ProxyOS — Reverse Proxy That Knows Your Infrastructure',
  description:
    'Expose any service behind TLS, add SSO with one toggle, see live traffic analytics. Built on Caddy\'s Admin API. Self-host free forever. Cloud from $9/mo.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
