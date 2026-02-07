'use client'

import { useRouter } from 'next/navigation'
import styles from './page.module.css'

const EXAMPLES = [
  { title: 'Matrix Operations', code: 'A = [1 2; 3 4];\nB = A * A\ndet(A)' },
  { title: 'Functions', code: 'function y = fib(n)\n  if n <= 1\n    y = n;\n  else\n    y = fib(n-1) + fib(n-2);\n  end\nend\nfib(10)' },
  { title: 'Statistics', code: 'data = [4 8 15 16 23 42];\nmean(data)\nstd(data)\nmedian(data)' },
  { title: 'Plotting (coming soon)', code: 'x = linspace(0, 2*pi, 100);\ny = sin(x);\n% plot(x, y)  coming soon!\ndisp(\'Plot support coming soon\')' },
]

export default function Home() {
  const router = useRouter()

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>M</span>
            <span className={styles.logoText}>MatFree</span>
          </div>
          <div className={styles.navLinks}>
            <button className={styles.navCta} onClick={() => router.push('/playground')}>
              Open Playground
            </button>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <h1 className={styles.heroTitle}>
            Scientific computing,<br />
            <span className={styles.heroAccent}>free and in your browser.</span>
          </h1>
          <p className={styles.heroSub}>
            MatFree is a free, open-source computing environment for numerical analysis,
            matrix operations, and data visualization. No installation. No license fees. Just math.
          </p>
          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => router.push('/playground')}>
              Try it now
            </button>
          </div>
        </section>

        <section className={styles.features}>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>&#x1D400;</div>
              <h3>Matrix Engine</h3>
              <p>Full support for dense matrices, linear algebra, eigenvalues, and more. All running natively in your browser via our TypeScript engine.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>f(x)</div>
              <h3>Rich Language</h3>
              <p>Functions, anonymous functions, closures, structs, cell arrays, control flow, error handling, and a growing standard library.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'>'}_</div>
              <h3>Interactive REPL</h3>
              <p>A full-featured command window with syntax highlighting, history, and instant feedback. Iterate fast on your ideas.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>MIT</div>
              <h3>Open Source</h3>
              <p>MIT licensed. No vendor lock-in. Contribute, fork, and extend. Built for the community by the community.</p>
            </div>
          </div>
        </section>

        <section className={styles.examples}>
          <h2>Try these examples</h2>
          <div className={styles.exampleGrid}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className={styles.exampleCard}
                onClick={() => router.push(`/playground?code=${encodeURIComponent(ex.code)}`)}
              >
                <h4>{ex.title}</h4>
                <pre className={styles.exampleCode}>{ex.code}</pre>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>MatFree is open-source software under the MIT License.</p>
      </footer>
    </div>
  )
}
