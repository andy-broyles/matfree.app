import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MatFree — Free Scientific Computing',
  description: 'MatFree is a free, open-source scientific computing environment that runs entirely in your browser. No installation required.',
  openGraph: {
    title: 'MatFree — Free Scientific Computing',
    description: 'A free, open-source scientific computing environment in your browser.',
    url: 'https://matfree.app',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8532809764658723"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
