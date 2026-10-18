import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Playground — MATLAB-Style Code in the Browser',
  description: 'Write and run MATLAB-style code free in your browser. REPL, plots, symbolic math, ODE45, and 200+ functions. No install.',
  openGraph: {
    title: 'MatFree Playground — MATLAB-Style Code in the Browser',
    description: 'Write and run MATLAB-style code free in your browser. Plots, symbolic math, and ODE45. No install.',
    url: 'https://matfree.app/playground',
  },
  alternates: {
    canonical: 'https://matfree.app/playground',
  },
}

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children
}
