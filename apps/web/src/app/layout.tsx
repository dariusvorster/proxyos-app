import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import { TRPCProvider } from '~/lib/trpc-provider'
import { Shell } from '~/components/shell'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'ProxyOS', template: 'ProxyOS — %s' },
  description: 'Route · Secure · Observe',
  openGraph: {
    title: 'ProxyOS',
    description: 'Route · Secure · Observe',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before React hydrates — prevents dark/light flash */}
        <script src="/theme-init.js" />
      </head>
      <body>
        <TRPCProvider>
          <Shell>{children}</Shell>
        </TRPCProvider>
      </body>
    </html>
  )
}
