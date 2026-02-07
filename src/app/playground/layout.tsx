import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Playground — Interactive REPL & Editor',
  description: 'Write and run scientific computing code instantly. Interactive REPL, code editor, 200+ built-in functions, plotting, symbolic math, and audio synthesis. Free, no installation.',
  openGraph: {
    title: 'MatFree Playground — Interactive Scientific Computing',
    description: 'Write and run scientific computing code instantly in your browser. Interactive plots, symbolic calculus, audio synthesis.',
    url: 'https://matfree.app/playground',
  },
  alternates: {
    canonical: 'https://matfree.app/playground',
  },
}

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children
}
