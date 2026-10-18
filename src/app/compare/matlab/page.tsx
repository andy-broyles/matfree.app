import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './compare.module.css'

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is MatFree a free MATLAB alternative?',
    a: 'Yes. MatFree runs MATLAB-style code in the browser: matrices, linear algebra, ode45, FFT, plots, and notebooks. There is no install and no license. It does not include Simulink or the full set of MATLAB toolboxes.',
  },
  {
    q: 'Is MatFree the same as the matfree Python package?',
    a: 'No. The matfree package on PyPI is matrix-free linear algebra for JAX. MatFree.app is a separate browser app for MATLAB-style scientific computing.',
  },
  {
    q: 'How is MatFree different from GNU Octave?',
    a: 'GNU Octave is the closest free desktop environment to MATLAB and can run many existing .m files. MatFree opens in a browser tab and covers core numerics, plotting, and notebooks. It is not a drop-in replacement for every Octave or MATLAB script.',
  },
  {
    q: 'Can I use MatFree instead of FreeMat?',
    a: 'FreeMat was a free MATLAB-like desktop program, and it has not had a public release in years. MatFree is a browser option for that kind of work: matrices, plots, and MATLAB-style syntax, with nothing to install.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. Open the playground or the notebook and run code. Computation stays in your browser tab.',
  },
]

export const metadata: Metadata = {
  title: 'Free MATLAB Alternative in Your Browser',
  description:
    'MatFree is a free MATLAB alternative in the browser — matrices, ODE45, FFT, plots, and notebooks. How it compares with MATLAB, Octave, and FreeMat.',
  alternates: { canonical: 'https://matfree.app/compare/matlab' },
  openGraph: {
    title: 'MatFree — Free MATLAB Alternative',
    description: 'MATLAB-style scientific computing in the browser, compared with MATLAB, Octave, and FreeMat. No install. No license.',
    url: 'https://matfree.app/compare/matlab',
  },
}

const ROWS: { feature: string; matfree: string; matlab: React.ReactNode }[] = [
  { feature: 'Price', matfree: 'Free — no account, no license', matlab: <>Paid licenses (student, home, commercial) — <a href="https://www.mathworks.com/pricing-licensing.html" target="_blank" rel="noopener noreferrer">MathWorks pricing</a></> },
  { feature: 'Install', matfree: 'None — opens in a browser tab', matlab: 'Desktop install, or MATLAB Online in a browser (MathWorks account required)' },
  { feature: 'Syntax', matfree: 'MATLAB‑style (.m‑like)', matlab: 'MATLAB' },
  { feature: 'Matrices & linear algebra', matfree: 'Yes (det, inv, eig, SVD, …)', matlab: 'Yes' },
  { feature: 'ODE solvers', matfree: 'ode45 (adaptive Dormand–Prince)', matlab: 'Full suite (ode45, ode23, ode15s, ode113, …)' },
  { feature: 'FFT / signal tools', matfree: 'fft, ifft, windows, chirp, xcorr built in', matlab: 'fft built in; many signal functions need Signal Processing Toolbox' },
  { feature: '2D / 3D plots', matfree: 'Interactive plots inline (zoom, pan, rotate)', matlab: 'Figure windows and Live Editor' },
  { feature: 'Notebooks', matfree: 'Built‑in notebook mode', matlab: 'Live Editor' },
  { feature: 'Where code runs', matfree: 'Locally, in your browser tab', matlab: 'Your computer (desktop) or MathWorks cloud (MATLAB Online)' },
  { feature: 'Best for', matfree: 'Learning, demos, quick analysis, teaching', matlab: 'Industry, research toolboxes, Simulink' },
]

export default function CompareMatlabPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>M</span>
          MatFree
        </Link>
        <div className={styles.navLinks}>
          <Link href="/playground">Playground</Link>
          <Link href="/notebook">Notebook</Link>
          <Link href="/playground" className={styles.cta}>Open App</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <p className={styles.eyebrow}>Comparison</p>
        <h1 className={styles.title}>A free MATLAB alternative that runs in your browser</h1>
        <p className={styles.lead}>
          MatFree gives you MATLAB‑style scientific computing — matrices, linear algebra, ODE45, FFT,
          plots, and notebooks — with no install and no license. It is not a complete MATLAB replacement
          for every toolbox, but it is a serious free environment for learning and analysis.
        </p>

        <div className={styles.actions}>
          <Link href="/playground" className={styles.primary}>Try the playground</Link>
          <Link href="/notebook" className={styles.secondary}>Open notebook</Link>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>MatFree</th>
              <th>MATLAB</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.feature}>
                <td data-label="Feature">{row.feature}</td>
                <td data-label="MatFree">{row.matfree}</td>
                <td data-label="MATLAB">{row.matlab}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className={styles.section}>
          <h2>When MatFree is the better fit</h2>
          <ul>
            <li>You want to run matrix math and plots immediately, with zero install</li>
            <li>You are teaching or learning numerical methods / linear algebra</li>
            <li>You need a shareable link instead of emailing <code>.m</code> files</li>
            <li>You want a free forever option without license servers</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>When to stick with MATLAB</h2>
          <ul>
            <li>You need Simulink, specialized toolboxes, or certified workflows</li>
            <li>You depend on proprietary file formats or enterprise support</li>
            <li>Your workload needs maximum numeric depth across every toolbox</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Octave and FreeMat</h2>
          <p>
            GNU Octave is the usual answer when someone wants a free MATLAB-style desktop
            program. It is a close syntax match and can run many existing <code>.m</code> files.
            MatFree is the version you open in a tab: core numerics, plots, and notebooks, without
            claiming to run every Octave or MATLAB script.
          </p>
          <p>
            FreeMat filled a similar role on the desktop, and its last public release was years
            ago. If you are looking for a FreeMat alternative you can use immediately, start in
            the <Link href="/playground">MatFree playground</Link>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Common questions</h2>
          <div className={styles.faq}>
            {FAQS.map(item => (
              <div key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQS.map(item => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            }),
          }}
        />

        <section className={styles.bottomCta}>
          <h2>Try it in under a minute</h2>
          <p>No account. No download. Open the playground and run MATLAB‑style code.</p>
          <Link href="/playground?code=A%20%3D%20%5B1%202%3B%203%204%5D%3B%0Adet(A)%0Ainv(A)" className={styles.primary}>
            Run a matrix example
          </Link>
        </section>
      </main>
    </div>
  )
}
