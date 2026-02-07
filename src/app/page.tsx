'use client'

import { useRouter } from 'next/navigation'
import styles from './page.module.css'

const EXAMPLES = [
  { title: 'Plot a Sine Wave', code: "x = linspace(0, 4*pi, 200);\nplot(x, sin(x))\ntitle('Sine Wave')\nxlabel('x')\nylabel('sin(x)')" },
  { title: 'Matrix Operations', code: 'A = [1 2; 3 4];\nB = A * A\ndet(A)\ninv(A)' },
  { title: 'Statistics & Histogram', code: "data = randn(1, 500);\nhist(data, 25)\ntitle('Normal Distribution')\nfprintf('Mean: %.4f\\n', mean(data))\nfprintf('Std: %.4f\\n', std(data))" },
  { title: 'Multi-Series Plot', code: "x = linspace(0, 2*pi, 80);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nlegend('sin(x)', 'cos(x)')\ntitle('Trig Functions')" },
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
              <p>Dense matrices, linear algebra, broadcasting, and 100+ built-in functions. All running natively in your browser - zero server round trips.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'///'}~</div>
              <h3>Beautiful Plots</h3>
              <p>Publication-quality 2D charts: line, scatter, bar, histogram, stem, area, stairs. Interactive tooltips. One-click PNG export. Dark theme by default.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'>'}_</div>
              <h3>Instant Startup</h3>
              <p>No 30-second splash screen. No license check. No Java runtime. Open the page and start computing in milliseconds.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'{ }'}=</div>
              <h3>Live Workspace</h3>
              <p>Variable explorer shows every variable, its type, size, and value in real-time. Click to inspect. Share your code with a single link.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>f(x)</div>
              <h3>Rich Language</h3>
              <p>Functions, anonymous functions, closures, structs, cell arrays, control flow, error handling, and a growing standard library of 100+ functions.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>$0</div>
              <h3>Free Forever</h3>
              <p>No subscriptions. No seat licenses. No vendor lock-in. Runs entirely in your browser. Your data never leaves your machine.</p>
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
        <p>&copy; {new Date().getFullYear()} MatFree</p>
      </footer>
    </div>
  )
}
