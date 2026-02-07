import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import 'katex/dist/katex.min.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://matfree.app'),
  title: {
    default: 'MatFree — Free Scientific Computing in Your Browser',
    template: '%s | MatFree',
  },
  description: 'Free scientific computing environment with 200+ built-in functions, symbolic math, 3D plots, audio synthesis, and a notebook mode. Runs entirely in your browser — no installation, no license fees.',
  keywords: [
    'scientific computing', 'matrix calculator', 'linear algebra', 'numerical analysis',
    'symbolic math', 'CAS', 'plotting', '3D plots', 'FFT', 'ODE solver',
    'free math software', 'browser math', 'online calculator', 'matrix operations',
    'signal processing', 'data visualization', 'notebook', 'REPL',
    'eigenvalues', 'SVD', 'curve fitting', 'interpolation', 'optimization',
    'audio synthesis', 'LaTeX math', 'math environment', 'engineering calculator',
  ],
  authors: [{ name: 'MatFree' }],
  creator: 'MatFree',
  publisher: 'MatFree',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://matfree.app',
    siteName: 'MatFree',
    title: 'MatFree — Free Scientific Computing in Your Browser',
    description: 'Symbolic math, interactive plots, 200+ functions, audio synthesis, and a full notebook mode. Free forever, runs in your browser.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatFree — Free Scientific Computing',
    description: 'Symbolic math, 3D plots, audio synthesis, 200+ built-in functions. Free, in your browser.',
  },
  alternates: {
    canonical: 'https://matfree.app',
  },
  category: 'technology',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="canonical" href="https://matfree.app" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8532809764658723"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'MatFree',
              url: 'https://matfree.app',
              description: 'Free scientific computing environment with symbolic math, 3D plots, audio synthesis, and 200+ built-in functions. Runs in your browser.',
              applicationCategory: 'EducationalApplication',
              operatingSystem: 'Any',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              featureList: [
                'Symbolic differentiation and integration',
                'Interactive 2D and 3D plots',
                'Audio synthesis and playback',
                'Matrix operations and linear algebra',
                'ODE solver (ode45)',
                'FFT and signal processing',
                'Jupyter-style notebook mode',
                'Code export to Python and Julia',
                'LaTeX math rendering',
                '200+ built-in scientific functions',
              ],
            }),
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
