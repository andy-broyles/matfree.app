'use client'

import { useRouter } from 'next/navigation'
import styles from './page.module.css'

const EXAMPLES = [
  { title: 'Symbolic Calculus', code: "% Symbolic differentiation\nsymdiff('x^3 + sin(x^2)', 'x')\n\n% Symbolic integration\nsymint('x^2 * exp(x)', 'x')\n\n% Solve equation\nsymsolve('x^2 - 5*x + 6', 'x')" },
  { title: 'Interactive Plot', code: "x = linspace(0, 4*pi, 200);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nlegend('sin(x)', 'cos(x)')\ntitle('Zoom: drag select. Pan: shift+drag')" },
  { title: 'Audio Synthesis', code: "% Generate and play a chord\nfs = 8192;\nt = linspace(0, 1, fs);\ny = 0.3*sin(2*pi*440*t) + 0.3*sin(2*pi*554*t) + 0.3*sin(2*pi*659*t);\nsound(y, fs)" },
  { title: 'Matrix Exponential', code: "% Rotation matrix\nA = [0 -1; 1 0];\nE = expm(A);\nfprintf('expm([0 -1; 1 0]):\\n')\ndisp(E)\nfprintf('Should be [cos(1) -sin(1); sin(1) cos(1)]\\n')" },
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
            Symbolic math, interactive plots, audio synthesis, 200+ built-in functions, and a full
            scientific computing engine. In your browser. No installation. No license. Just math.
          </p>
          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => router.push('/playground')}>
              Try it now
            </button>
          </div>
        </section>

        <section className={styles.tutorial}>
          <h2>5-step quick start</h2>
          <p className={styles.tutorialIntro}>New to MatFree? Here&apos;s where everything is.</p>
          <ol className={styles.tutorialSteps}>
            <li>
              <span className={styles.stepNum}>1</span>
              <strong>Open Playground or Notebook</strong> — Click &quot;Open Playground&quot; above (or <button type="button" className={styles.stepLink} onClick={() => router.push('/playground')}>here</button>) for a quick REPL. For structured work with multiple cells, use the <button type="button" className={styles.stepLink} onClick={() => router.push('/notebook')}>Notebook</button>.
            </li>
            <li>
              <span className={styles.stepNum}>2</span>
              <strong>Type your code</strong> — The editor at the top is where you write MatFree code (MATLAB-style syntax). Try <code>x = 1:10; plot(x, x.^2)</code>.
            </li>
            <li>
              <span className={styles.stepNum}>3</span>
              <strong>Run it</strong> — Press <kbd>Enter</kbd> to execute a line, or <kbd>Ctrl+Enter</kbd> to run the full editor. <kbd>Shift+Enter</kbd> for multi-line input.
            </li>
            <li>
              <span className={styles.stepNum}>4</span>
              <strong>See results</strong> — Output appears below the editor. Plots show in the plot panel on the right. Use the <strong>Variable explorer</strong> to inspect values.
            </li>
            <li>
              <span className={styles.stepNum}>5</span>
              <strong>Get help</strong> — Press <kbd>Ctrl+K</kbd> for the command palette: examples, shortcuts, and more. Try &quot;Plotting → Sine Wave&quot; to load a ready-made example.
            </li>
          </ol>
        </section>

        <section className={styles.features}>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>d/dx</div>
              <h3>Symbolic Math</h3>
              <p>Differentiation, integration, equation solving, Taylor series, simplification, and expansion. A full CAS running in your browser.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'///'}~</div>
              <h3>Interactive Plots</h3>
              <p>Zoom, pan, crosshair tracking. 9 plot types. Annotations. CSV data export. PNG export. Heatmaps with Viridis colormap. All interactive.</p>
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
              <p>Command palette, autocomplete, variable explorer, shareable links, session persistence, CSV drag-and-drop import. A real IDE.</p>
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
