import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notebook — Jupyter-Style Scientific Computing',
  description: 'Create interactive notebooks with code cells, markdown, plots, and LaTeX math rendering. Like Jupyter, but for MatFree — free and in your browser.',
  openGraph: {
    title: 'MatFree Notebook — Interactive Scientific Notebooks',
    description: 'Jupyter-style notebooks with code, markdown, plots, and LaTeX math. Free, in your browser.',
    url: 'https://matfree.app/notebook',
  },
  alternates: {
    canonical: 'https://matfree.app/notebook',
  },
}

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return children
}
