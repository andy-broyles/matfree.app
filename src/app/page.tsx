'use client'

import Link from 'next/link'
import styles from './page.module.css'

const EXAMPLES = [
  { title: 'Symbolic Calculus', code: "% Symbolic differentiation\nsymdiff('x^3 + sin(x^2)', 'x')\n\n% Symbolic integration\nsymint('x^2 * exp(x)', 'x')\n\n% Solve equation\nsymsolve('x^2 - 5*x + 6', 'x')" },
  { title: 'Interactive Plot', code: "x = linspace(0, 4*pi, 200);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nlegend('sin(x)', 'cos(x)')\ntitle('Zoom: drag select. Pan: shift+drag')" },
  { title: 'Audio Synthesis', code: "% Generate and play a chord\nfs = 8192;\nt = linspace(0, 1, fs);\ny = 0.3*sin(2*pi*440*t) + 0.3*sin(2*pi*554*t) + 0.3*sin(2*pi*659*t);\nsound(y, fs)" },
  { title: 'Matrix Exponential', code: "% Rotation matrix\nA = [0 -1; 1 0];\nE = expm(A);\nfprintf('expm([0 -1; 1 0]):\\n')\ndisp(E)\nfprintf('Should be [cos(1) -sin(1); sin(1) cos(1)]\\n')" },
]

export default function Home() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>M</span>
            <span className={styles.logoText}>MatFree</span>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/notebook">Notebook</Link>
            <Link href="/compare/matlab">Compare</Link>
            <Link href="/playground" className={styles.navCta}>Open Playground</Link>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <h1 className={styles.heroTitle}>
            <span className={styles.heroBrand}>MatFree</span>
            Scientific computing,<br />
            <span className={styles.heroAccent}>free and in your browser.</span>
          </h1>
          <p className={styles.heroSub}>
            A free MATLAB alternative. Symbolic math, interactive plots, audio synthesis, and 200+
            built-in functions. No installation. No license.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/playground" className={styles.ctaPrimary}>Try it now</Link>
            <Link href="/compare/matlab" className={styles.ctaSecondary}>Compare with MATLAB</Link>
          </div>
        </section>

        <section className={styles.pitch}>
          <h2>A free MATLAB alternative</h2>
          <p>
            MatFree is for MATLAB-style scientific computing without a license or an install.
            Matrices, plots, ODE45, FFT, and notebooks run in the browser tab.
          </p>
          <p>
            This site is not the matfree Python package. That project is matrix-free linear
            algebra for JAX, on PyPI and GitHub. MatFree.app is the browser app.
          </p>
          <p>
            <Link href="/compare/matlab">See how MatFree compares with MATLAB, Octave, and FreeMat</Link>
          </p>
        </section>

        <section className={styles.tutorial}>
          <h2>5-step quick start</h2>
          <p className={styles.tutorialIntro}>New to MatFree? Here&apos;s where everything is.</p>
          <ol className={styles.tutorialSteps}>
            <li>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepBody}>
                <strong>Open Playground or Notebook</strong> — Use the <Link href="/playground" className={styles.stepLink}>Playground</Link> for a quick REPL. For structured work with multiple cells, use the <Link href="/notebook" className={styles.stepLink}>Notebook</Link>.
              </span>
            </li>
            <li>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepBody}>
                <strong>Type your code</strong> — The editor at the top is where you write MatFree code (MATLAB-style syntax). Try <code>x = 1:10; plot(x, x.^2)</code>.
              </span>
            </li>
            <li>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepBody}>
                <strong>Run it</strong> — Press <kbd>Enter</kbd> to execute a line, or <kbd>Ctrl+Enter</kbd> to run the full editor. <kbd>Shift+Enter</kbd> for multi-line input.
              </span>
            </li>
            <li>
              <span className={styles.stepNum}>4</span>
              <span className={styles.stepBody}>
                <strong>See results</strong> — Output and plots appear below the editor. Use the <strong>Variable explorer</strong> on the right to inspect values.
              </span>
            </li>
            <li>
              <span className={styles.stepNum}>5</span>
              <span className={styles.stepBody}>
                <strong>Get help</strong> — Press <kbd>Ctrl+K</kbd> for the command palette: examples, shortcuts, and more. Try &quot;Plotting → Sine Wave&quot; to load a ready-made example.
              </span>
            </li>
          </ol>
        </section>

        <section className={styles.features}>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>d/dx</div>
              <h3>Symbolic Math</h3>
              <p>Differentiation, integration, equation solving, Taylor series, simplification, and expansion &mdash; a practical CAS for common expressions.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'///'}~</div>
              <h3>Interactive Plots</h3>
              <p>Zoom, pan, crosshair tracking. Line, scatter, bar, hist, surface, mesh, contour, heatmaps, and more. PNG and CSV export.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>&#x1D400;</div>
              <h3>200+ Functions</h3>
              <p>FFT, ODE45, splines, optimization, SVD, eigendecomposition, matrix exponential, window functions, signal processing, and more.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>&#x266B;</div>
              <h3>Audio Synthesis</h3>
              <p>Generate sine, square, sawtooth, and chirp signals. Play them directly in the browser. Build synthesizers, sonify data, teach acoustics.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'>'}_</div>
              <h3>Live Workspace</h3>
              <p>Command palette, autocomplete, variable explorer, shareable links, session persistence, and CSV drag-and-drop import.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>$0</div>
              <h3>Free Forever</h3>
              <p>No subscriptions. No seat licenses. No vendor lock-in. Computation runs in your browser &mdash; your scripts are not sent to a MatFree server.</p>
            </div>
          </div>
        </section>

        <section className={styles.examples}>
          <h2>Try these examples</h2>
          <div className={styles.exampleGrid}>
            {EXAMPLES.map((ex) => (
              <Link
                key={ex.title}
                href={`/playground?code=${encodeURIComponent(ex.code)}`}
                className={styles.exampleCard}
              >
                <h4>{ex.title}</h4>
                <pre className={styles.exampleCode}>{ex.code}</pre>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <nav className={styles.footerNav} aria-label="Footer">
          <Link href="/playground">Playground</Link>
          <Link href="/notebook">Notebook</Link>
          <Link href="/compare/matlab">Compare with MATLAB</Link>
        </nav>
        <p>&copy; {new Date().getFullYear()} MatFree</p>
      </footer>
    </div>
  )
}
