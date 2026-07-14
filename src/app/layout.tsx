import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import 'katex/dist/katex.min.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://matfree.app'),
  title: {
    default: 'MatFree — Free MATLAB Alternative in Your Browser',
    template: '%s | MatFree',
  },
  description: 'Free MATLAB-style scientific computing in your browser. Matrices, ODE45, FFT, plots, notebooks — no install, no license. 200+ built-in functions.',
  keywords: [
    'free matlab alternative', 'matlab online', 'matlab in browser', 'octave alternative',
    'scientific computing', 'matrix calculator', 'linear algebra', 'numerical analysis',
    'symbolic math', 'CAS', 'plotting', '3D plots', 'FFT', 'ODE solver',
    'free math software', 'browser math', 'online calculator', 'matrix operations',
    'signal processing', 'data visualization', 'notebook', 'REPL',
    'eigenvalues', 'SVD', 'curve fitting', 'interpolation', 'optimization',
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
    title: 'MatFree — Free MATLAB Alternative in Your Browser',
    description: 'MATLAB-style scientific computing in the browser. Matrices, ODE45, FFT, plots, notebooks. Free forever.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatFree — Free MATLAB Alternative',
    description: 'Run MATLAB-style code in your browser. Free, no install, no license.',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
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
