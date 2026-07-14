import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './compare.module.css'

export const metadata: Metadata = {
  title: 'Free MATLAB Alternative in Your Browser',
  description:
    'MatFree is a free MATLAB alternative that runs in your browser — matrices, ODE45, FFT, plots, notebooks, no install, no license.',
  alternates: { canonical: 'https://matfree.app/compare/matlab' },
  openGraph: {
    title: 'MatFree — Free MATLAB Alternative',
    description: 'Scientific computing in the browser. No install. No license. MATLAB-style syntax.',
    url: 'https://matfree.app/compare/matlab',
  },
}

const ROWS = [
  { feature: 'Price', matfree: 'Free forever', matlab: '$99–$2,150+/yr' },
  { feature: 'Install', matfree: 'None — opens in a browser tab', matlab: 'Multi‑GB desktop install' },
  { feature: 'Syntax', matfree: 'MATLAB‑style (.m‑like)', matlab: 'MATLAB' },
  { feature: 'Matrices & linear algebra', matfree: 'Yes (det, inv, eig, SVD, …)', matlab: 'Yes' },
  { feature: 'ODE solvers', matfree: 'ode45 and friends', matlab: 'Extensive toolbox' },
  { feature: 'FFT / signal tools', matfree: 'Yes', matlab: 'Yes (Signal Processing Toolbox)' },
  { feature: '2D / 3D plots', matfree: 'Interactive plots in‑page', matlab: 'Desktop figure windows' },
  { feature: 'Notebooks', matfree: 'Built‑in notebook mode', matlab: 'Live Editor' },
  { feature: 'Offline / local compute', matfree: 'Runs in your browser', matlab: 'Desktop / licensed cloud' },
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
                <td>{row.feature}</td>
                <td>{row.matfree}</td>
                <td>{row.matlab}</td>
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
