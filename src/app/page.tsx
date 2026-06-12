'use client'

import { useRouter } from 'next/navigation'
import styles from './page.module.css'

const EXAMPLES = [
  {
    title: 'Symbolic Calculus',
    tag: 'CAS',
    code: "% Symbolic differentiation\nsymdiff('x^3 + sin(x^2)', 'x')\n\n% Symbolic integration\nsymint('x^2 * exp(x)', 'x')\n\n% Solve equation\nsymsolve('x^2 - 5*x + 6', 'x')",
  },
  {
    title: 'Interactive Plotting',
    tag: 'Visualization',
    code: "x = linspace(0, 4*pi, 200);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nlegend('sin(x)', 'cos(x)')\ntitle('Zoom: drag select. Pan: shift+drag')",
  },
  {
    title: '3D Surface Plot',
    tag: '3D',
    code: "[X, Y] = meshgrid(linspace(-3,3,40), linspace(-3,3,40));\nZ = sin(sqrt(X.^2 + Y.^2));\nsurf(X, Y, Z)\ntitle('sin(sqrt(x^2 + y^2))')",
  },
  {
    title: 'FFT Spectrum Analysis',
    tag: 'Signal Processing',
    code: "fs = 1024; t = linspace(0, 1, fs);\nx = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t);\nX = abs(fft(x));\nf = linspace(0, fs, length(X));\nplot(f(1:fs/2), X(1:fs/2))\ntitle('Frequency Spectrum')\nxlabel('Hz')",
  },
  {
    title: 'ODE Solver',
    tag: 'Differential Equations',
    code: "% Solve van der Pol oscillator\nf = @(t, y) [y(2); 2*(1 - y(1)^2)*y(2) - y(1)];\n[t, Y] = ode45(f, [0 20], [2; 0]);\nplot(t, Y(:,1))\ntitle('Van der Pol Oscillator')",
  },
  {
    title: 'Audio Synthesis',
    tag: 'Audio',
    code: "% Generate and play a chord\nfs = 8192;\nt = linspace(0, 1, fs);\ny = 0.3*sin(2*pi*440*t) + 0.3*sin(2*pi*554*t) + 0.3*sin(2*pi*659*t);\nsound(y, fs)",
  },
  {
    title: 'SVD Image Compression',
    tag: 'Linear Algebra',
    code: "A = rand(50, 50);\n[U, S, V] = svd(A);\n\n% Rank-5 approximation\nk = 5;\nA_approx = U(:,1:k) * S(1:k,1:k) * V(:,1:k)';\nfprintf('Full rank: %d\\n', rank(A))\nfprintf('Approx error: %f\\n', norm(A - A_approx))",
  },
  {
    title: 'Curve Fitting',
    tag: 'Statistics',
    code: "x = [1 2 3 4 5 6 7 8];\ny = [1.2 2.8 6.1 11.9 20.1 31.5 44.8 62.0];\np = polyfit(x, y, 3);\nxfit = linspace(1, 8, 100);\nyfit = polyval(p, xfit);\nhold('on')\nplot(xfit, yfit)\nplot(x, y, 'ro')\ntitle('Cubic Polynomial Fit')",
  },
  {
    title: 'Matrix Exponential',
    tag: 'Advanced Math',
    code: "% Rotation matrix via expm\nA = [0 -1; 1 0];\nE = expm(A);\nfprintf('expm([0 -1; 1 0]):\\n')\ndisp(E)\nfprintf('cos(1) = %f\\n', cos(1))\nfprintf('sin(1) = %f\\n', sin(1))",
  },
  {
    title: 'Numerical Integration',
    tag: 'Calculus',
    code: "% Compute integrals numerically\nf1 = @(x) exp(-x.^2);\nresult = integral(f1, -inf, inf);\nfprintf('integral of e^(-x^2): %f\\n', result)\nfprintf('sqrt(pi) = %f\\n', sqrt(pi))",
  },
  {
    title: 'Eigenvalue Analysis',
    tag: 'Linear Algebra',
    code: "% Eigendecomposition\nA = [4 1 2; 1 3 1; 2 1 5];\n[V, D] = eig(A);\nfprintf('Eigenvalues:\\n')\ndisp(diag(D))\nfprintf('Condition number: %f\\n', cond(A))",
  },
  {
    title: 'Export to Python',
    tag: 'Transpiler',
    code: "% Write MatFree, export to Python\nto_python('x = linspace(0, 2*pi, 100); y = sin(x); plot(x, y)')",
  },
]

const CAPABILITIES = [
  {
    category: 'Analysis',
    icon: '\u03A3',
    items: ['Symbolic differentiation & integration', 'Taylor series expansion', 'Equation solving (symbolic & numerical)', 'Polynomial fitting & interpolation', 'Optimization (Nelder-Mead, Brent)'],
  },
  {
    category: 'Visualization',
    icon: '\u2588',
    items: ['2D line, scatter, bar, histogram, stem, area', '3D surface, mesh, contour, plot3', 'Heatmaps with Viridis colormap', 'Interactive zoom, pan, crosshair', 'PNG & CSV export'],
  },
  {
    category: 'Computation',
    icon: '\u03BB',
    items: ['FFT & inverse FFT, power spectral density', 'ODE45 adaptive Runge-Kutta solver', 'SVD, eigendecomposition, LU, QR, Cholesky', 'Matrix exponential, logarithm, square root', 'Sparse linear solvers'],
  },
  {
    category: 'Tools',
    icon: '\u2699',
    items: ['Jupyter-style notebook mode', 'Code export to Python & Julia', 'AI code assistant', 'Persistent file system (IndexedDB)', 'Step debugger engine'],
  },
]

const STATS = [
  { value: '200+', label: 'Built-in Functions' },
  { value: '12', label: 'Plot Types' },
  { value: '0ms', label: 'Install Time' },
  { value: '$0', label: 'License Cost' },
]

const COMPARE = [
  { feature: 'Price', matfree: 'Free forever', other: '$99-$2,150/yr' },
  { feature: 'Installation', matfree: 'None \u2014 runs in browser', other: '2-10 GB download' },
  { feature: 'Platform', matfree: 'Any device with a browser', other: 'Windows/Mac/Linux' },
  { feature: 'Symbolic Math', matfree: 'Built-in CAS', other: 'Requires add-on toolbox' },
  { feature: 'Audio Playback', matfree: 'Native browser audio', other: 'Desktop only' },
  { feature: 'Sharing', matfree: 'Shareable URL links', other: 'Send .m files' },
  { feature: 'Notebook Mode', matfree: 'Built-in', other: 'Requires Live Editor' },
  { feature: 'Export to Python', matfree: 'One command', other: 'Manual rewrite' },
]

export default function Home() {
  const router = useRouter()

  return (
    <div className={styles.page}>
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>M</span>
            <span className={styles.logoText}>MatFree</span>
          </div>
          <div className={styles.navLinks}>
            <button className={styles.navLink} onClick={() => router.push('/playground')}>
              Playground
            </button>
            <button className={styles.navLink} onClick={() => router.push('/notebook')}>
              Notebook
            </button>
            <button className={styles.navCta} onClick={() => router.push('/playground')}>
              Open App
            </button>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <h1 className={styles.heroTitle}>
            Scientific computing,<br />
            <span className={styles.heroAccent}>free and in your browser.</span>
          </h1>
          <p className={styles.heroSub}>
            200+ built-in functions. Symbolic calculus. Interactive 2D &amp; 3D plots.
            Audio synthesis. ODE solvers. A full notebook mode. No installation.
            No license. Just math.
          </p>
          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => router.push('/playground')}>
              Launch Playground
            </button>
            <button className={styles.ctaSecondary} onClick={() => router.push('/notebook')}>
              Open Notebook
            </button>
          </div>
        </section>

        {/* ── Stats Bar ── */}
        <section className={styles.statsBar}>
          {STATS.map((s, i) => (
            <div key={i} className={styles.stat}>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </section>

        {/* ── Features ── */}
        <section className={styles.features}>
          <h2 className={styles.sectionTitle}>Everything you need</h2>
          <p className={styles.sectionSub}>A complete scientific computing environment, reimagined for the web.</p>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>d/dx</div>
              <h3>Symbolic Math</h3>
              <p>Differentiation, integration, equation solving, Taylor series, simplification, and expansion. A full CAS in your browser.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'///'}~</div>
              <h3>Interactive Plots</h3>
              <p>12 plot types including 3D surfaces. Zoom, pan, crosshair tracking. Heatmaps. Annotations. PNG &amp; CSV export.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>&#x1D400;</div>
              <h3>200+ Functions</h3>
              <p>FFT, ODE45, splines, optimization, SVD, eigendecomposition, matrix exponential, signal processing, and more.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>&#x266B;</div>
              <h3>Audio Synthesis</h3>
              <p>Generate sine, square, sawtooth, and chirp signals. Play them directly in the browser. Sonify data, teach acoustics.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>{'>'}_</div>
              <h3>Live Workspace</h3>
              <p>Command palette, autocomplete, variable explorer, shareable links, session persistence, CSV drag-and-drop import.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>$0</div>
              <h3>Free Forever</h3>
              <p>No subscriptions. No seat licenses. No vendor lock-in. Runs entirely in your browser. Your data stays on your machine.</p>
            </div>
          </div>
        </section>

        {/* ── Getting Started ── */}
        <section className={styles.gettingStarted}>
          <h2 className={styles.sectionTitle}>Up and running in seconds</h2>
          <p className={styles.sectionSub}>No downloads. No accounts. No setup.</p>
          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Open your browser</h3>
              <p>Navigate to matfree.app. That&apos;s it. Works on Chrome, Firefox, Safari, Edge &mdash; desktop or mobile.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Write code</h3>
              <p>Use the REPL for quick calculations, or the full editor for scripts. Autocomplete and help are built in.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>See results instantly</h3>
              <p>Plots render inline. Variables update live. Audio plays immediately. Share your work with a URL.</p>
            </div>
          </div>
        </section>

        {/* ── Capabilities ── */}
        <section className={styles.capabilities}>
          <h2 className={styles.sectionTitle}>Full-spectrum capabilities</h2>
          <p className={styles.sectionSub}>From symbolic calculus to 3D visualization, all running locally in your browser.</p>
          <div className={styles.capGrid}>
            {CAPABILITIES.map((cap, i) => (
              <div key={i} className={styles.capCard}>
                <div className={styles.capHeader}>
                  <span className={styles.capIcon}>{cap.icon}</span>
                  <h3>{cap.category}</h3>
                </div>
                <ul className={styles.capList}>
                  {cap.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Examples ── */}
        <section className={styles.examples}>
          <h2 className={styles.sectionTitle}>Try these examples</h2>
          <p className={styles.sectionSub}>Click any card to open it in the playground and run it instantly.</p>
          <div className={styles.exampleGrid}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className={styles.exampleCard}
                onClick={() => router.push(`/playground?code=${encodeURIComponent(ex.code)}`)}
              >
                <div className={styles.exampleHeader}>
                  <h4>{ex.title}</h4>
                  <span className={styles.exampleTag}>{ex.tag}</span>
                </div>
                <pre className={styles.exampleCode}>{ex.code}</pre>
              </button>
            ))}
          </div>
        </section>

        {/* ── Comparison ── */}
        <section className={styles.comparison}>
          <h2 className={styles.sectionTitle}>How MatFree compares</h2>
          <p className={styles.sectionSub}>Everything you expect from a scientific computing platform &mdash; without the price tag.</p>
          <div className={styles.tableWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th></th>
                  <th className={styles.colMatfree}>MatFree</th>
                  <th className={styles.colOther}>Traditional Tools</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={i}>
                    <td className={styles.featureLabel}>{row.feature}</td>
                    <td className={styles.cellMatfree}>{row.matfree}</td>
                    <td className={styles.cellOther}>{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className={styles.ctaBanner}>
          <div className={styles.ctaBannerGlow} />
          <h2>Ready to compute?</h2>
          <p>Start solving problems in seconds. No credit card. No installation. No limits.</p>
          <div className={styles.ctaBannerButtons}>
            <button className={styles.ctaPrimary} onClick={() => router.push('/playground')}>
              Launch Playground
            </button>
            <button className={styles.ctaSecondary} onClick={() => router.push('/notebook')}>
              Open Notebook
            </button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.logoIcon}>M</span>
            <span>MatFree</span>
          </div>
          <div className={styles.footerLinks}>
            <button onClick={() => router.push('/playground')}>Playground</button>
            <button onClick={() => router.push('/notebook')}>Notebook</button>
          </div>
          <p className={styles.footerCopy}>&copy; {new Date().getFullYear()} MatFree</p>
        </div>
      </footer>
    </div>
  )
}
