import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notebook — MATLAB-Style Notebooks in the Browser',
  description: 'Notebooks for MATLAB-style code, with plots, markdown, and LaTeX. Free, in your browser, no install.',
  openGraph: {
    title: 'MatFree Notebook — MATLAB-Style Notebooks in the Browser',
    description: 'Notebooks for MATLAB-style code, with plots and LaTeX. Free, in your browser, no install.',
    url: 'https://matfree.app/notebook',
  },
  alternates: {
    canonical: 'https://matfree.app/notebook',
  },
}

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return children
}
