import type { Metadata } from 'next'
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
      <body>{children}</body>
    </html>
  )
}
