'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message { role: 'user' | 'assistant'; text: string; code?: string }
interface Props { onRunCode: (code: string) => void; visible: boolean; onClose: () => void }

const TEMPLATES: { patterns: RegExp[]; reply: string; code?: string }[] = [
  { patterns: [/plot.*sin/i, /sine.*wave/i, /sin.*plot/i], reply: "Here's a sine wave plot:", code: "x = linspace(0, 4*pi, 200);\nplot(x, sin(x))\ntitle('Sine Wave')\nxlabel('x')\nylabel('sin(x)')" },
  { patterns: [/lorenz/i, /strange.*attractor/i], reply: "Here's the Lorenz attractor using ODE45:", code: "% Lorenz system\nsigma = 10; rho = 28; beta = 8/3;\nresult = ode45(@(t,y) [sigma*(y(2)-y(1)); y(1)*(rho-y(3))-y(2); y(1)*y(2)-beta*y(3)], [0 50], [1 1 1]);\nt = result{1}; Y = result{2};\nplot(Y(:,1), Y(:,3))\ntitle('Lorenz Attractor')\nxlabel('x')\nylabel('z')" },
  { patterns: [/matrix.*mult/i, /multiply.*matri/i], reply: "Matrix multiplication:", code: "A = [1 2 3; 4 5 6; 7 8 9];\nB = [9 8 7; 6 5 4; 3 2 1];\nC = A * B\ndisp(C)" },
  { patterns: [/eigenvalue/i, /eigen/i], reply: "Computing eigenvalues and eigenvectors:", code: "A = [4 1 2; 1 3 1; 2 1 5];\neig_result = eig_full(A);\nfprintf('Eigenvectors V:\\n'); disp(eig_result{1})\nfprintf('Eigenvalues D:\\n'); disp(eig_result{2})" },
  { patterns: [/solve.*equation/i, /root.*find/i, /find.*root/i], reply: "Solving equations:", code: "% Symbolic solve\nsymsolve('x^2 - 5*x + 6', 'x')\n\n% Numerical root finding\nroot = fzero(@(x) x^3 - 2*x - 5, 2);\nfprintf('Numerical root: %f\\n', root)" },
  { patterns: [/derivative/i, /differentiat/i, /d\/dx/i], reply: "Symbolic differentiation:", code: "% First derivative\nsymdiff('x^3 + sin(x^2)', 'x')\n\n% Second derivative\nsymdiff('x^4 - 3*x^2 + 1', 'x', 2)" },
  { patterns: [/integrat/i, /antiderivative/i], reply: "Symbolic integration:", code: "% Indefinite integrals\nsymint('x^2', 'x')\nsymint('sin(x)', 'x')\nsymint('exp(x)*cos(x)', 'x')" },
  { patterns: [/taylor/i, /series.*expan/i], reply: "Taylor series expansion:", code: "symtaylor('sin(x)', 'x', 0, 7)\nsymtaylor('exp(x)', 'x', 0, 5)\nsymtaylor('ln(1+x)', 'x', 0, 6)" },
  { patterns: [/fft|fourier|spectrum|frequency/i], reply: "FFT spectrum analysis:", code: "fs = 256; t = linspace(0, 1, fs);\nx = sin(2*pi*30*t) + 0.5*sin(2*pi*80*t) + 0.3*randn(1, fs);\nX = abs_fft(x);\nplot(X(1:fs/2))\ntitle('FFT Spectrum')\nxlabel('Frequency (Hz)')\nylabel('Magnitude')" },
  { patterns: [/ode|differential.*eq/i], reply: "Solving ODEs with ode45:", code: "% Damped harmonic oscillator: y'' + 0.5y' + 4y = 0\n% Convert to system: y1' = y2, y2' = -0.5*y2 - 4*y1\nresult = ode45(@(t,y) [y(2); -0.5*y(2) - 4*y(1)], [0 20], [2 0]);\nt = result{1}; y = result{2};\nplot(t, y(:,1))\ntitle('Damped Harmonic Oscillator')\nxlabel('Time')\nylabel('Displacement')" },
  { patterns: [/histogram|distribution|normal|gaussian/i], reply: "Statistical distributions:", code: "data = randn(1, 5000);\nhist(data, 50)\ntitle('Normal Distribution (n=5000)')\nxlabel('Value')\nylabel('Frequency')\nfprintf('Mean: %.4f, Std: %.4f\\n', mean(data), std(data))" },
  { patterns: [/audio|sound|tone|music|synth/i], reply: "Audio synthesis:", code: "fs = 8192; t = linspace(0, 1, fs);\n% A major chord: A4 + C#5 + E5\ny = 0.3*sin(2*pi*440*t) + 0.3*sin(2*pi*554*t) + 0.3*sin(2*pi*659*t);\nsound(y, fs)" },
  { patterns: [/curve.*fit|regression|polyfit/i], reply: "Curve fitting:", code: "x = [1 2 3 4 5 6 7 8 9 10];\ny = [2.1 4.8 7.2 11.5 14.0 18.3 20.5 25.1 27.8 32.0];\np = polyfit(x, y, 1);\nxf = linspace(1, 10, 50);\nyf = polyval(p, xf);\nhold('on')\nscatter(x, y, 6)\nplot(xf, yf, 'r')\nlegend('Data', sprintf('y = %.2fx + %.2f', p(1), p(2)))\ntitle('Linear Regression')" },
  { patterns: [/interpolat|spline/i], reply: "Spline interpolation:", code: "x = [0 1 2 3 4 5];\ny = [0 0.84 0.91 0.14 -0.76 -0.96];\nxq = linspace(0, 5, 100);\nyq = spline(x, y, xq);\nhold('on')\nscatter(x, y, 6)\nplot(xq, yq, 'r')\nlegend('Data', 'Cubic Spline')\ntitle('Spline Interpolation')" },
  { patterns: [/3d.*plot|plot.*3d|surface|surf/i], reply: "3D surface plot:", code: "[X, Y] = meshgrid(linspace(-2, 2, 30));\nZ = sin(X.^2 + Y.^2) .* exp(-0.3*(X.^2 + Y.^2));\nsurf(X, Y, Z)\ntitle('3D Surface')" },
  { patterns: [/contour/i], reply: "Contour plot:", code: "[X, Y] = meshgrid(linspace(-3, 3, 40));\nZ = sin(X) .* cos(Y);\ncontour(X, Y, Z)\ntitle('Contour Plot')" },
  { patterns: [/prime|factori/i], reply: "Number theory:", code: "p = primes(100);\nfprintf('Primes up to 100:\\n'); disp(p)\nfprintf('\\nFactorization of 360: '); disp(factor(360))\nfprintf('C(10,3) = %d\\n', nchoosek(10, 3))" },
  { patterns: [/window|hamming|signal.*proc/i], reply: "Signal processing windows:", code: "n = 64;\nhold('on')\nplot(hamming(n))\nplot(hanning(n))\nplot(blackman(n))\nplot(kaiser(n, 5))\nlegend('Hamming', 'Hanning', 'Blackman', 'Kaiser')\ntitle('Window Functions')" },
  { patterns: [/help|what.*can|function.*list/i], reply: "MatFree has 200+ built-in functions. Here are the categories:\n\n**Math**: sin, cos, exp, log, sqrt, abs, floor, ceil, round, mod\n**Linear Algebra**: det, inv, eig, svd, lu, qr, chol, expm, sqrtm\n**Statistics**: mean, std, var, median, normpdf, normcdf\n**Signal**: fft, ifft, conv, filter, hamming, pwelch\n**Symbolic**: symdiff, symint, symsolve, symexpand, symtaylor\n**Plotting**: plot, scatter, bar, hist, stem, area, surf, mesh\n**Audio**: sound, chirp, sawtooth, square\n\nType `help('functionname')` for details on any function." },
  { patterns: [/export.*python|python.*export|convert.*python/i], reply: "You can export your code to Python! Use the **Export** button in the editor toolbar, or I can show you what your code looks like in Python.", code: "% Example code to export\nx = linspace(0, 2*pi, 100);\ny = sin(x) + 0.5*cos(2*x);\nplot(x, y)\ntitle('My Function')" },
]

function getResponse(input: string): { reply: string; code?: string } {
  const lower = input.toLowerCase()
  for (const t of TEMPLATES) {
    for (const p of t.patterns) {
      if (p.test(lower)) return { reply: t.reply, code: t.code }
    }
  }
  // Fallback: try to be helpful
  if (lower.includes('how') || lower.includes('what') || lower.includes('?'))
    return { reply: "I can help you with:\n- **Plotting**: \"plot a sine wave\", \"3D surface\", \"histogram\"\n- **Math**: \"solve equation\", \"derivative\", \"integrate\", \"Taylor series\"\n- **Linear Algebra**: \"eigenvalues\", \"matrix multiply\", \"SVD\"\n- **Signal Processing**: \"FFT spectrum\", \"window functions\"\n- **Audio**: \"generate a tone\", \"synthesize sound\"\n- **ODE**: \"solve differential equation\", \"Lorenz attractor\"\n\nJust describe what you want to do!" }
  return { reply: `I'll try to help with "${input}". Try describing what you want to compute or plot - for example "plot a sine wave" or "solve x^2 - 5x + 6 = 0".` }
}

export default function AIAssistant({ onRunCode, visible, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: "Hi! I'm the MatFree assistant. Tell me what you want to compute, and I'll write the code for you.\n\nTry: \"plot the Lorenz attractor\" or \"solve x^2-5x+6=0\"" }
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages])

  const submit = useCallback(() => {
    if (!input.trim()) return
    const userMsg: Message = { role: 'user', text: input }
    const resp = getResponse(input)
    const assistMsg: Message = { role: 'assistant', text: resp.reply, code: resp.code }
    setMessages(prev => [...prev, userMsg, assistMsg])
    setInput('')
  }, [input])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, background: '#13131d',
      borderLeft: '1px solid #1e1e2e', display: 'flex', flexDirection: 'column', zIndex: 100,
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: '#e4e4ef', fontSize: 14 }}>AI Assistant</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666680', cursor: 'pointer', fontSize: 18 }}>x</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            background: m.role === 'user' ? '#1e1e2e' : '#0e0e16',
            borderRadius: 10, padding: '10px 14px', maxWidth: '95%',
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            border: m.role === 'assistant' ? '1px solid #1e1e2e' : 'none',
          }}>
            <div style={{ color: '#a0a0b8', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
            {m.code && (
              <div style={{ marginTop: 8 }}>
                <pre style={{
                  background: '#0a0a14', borderRadius: 6, padding: '10px 12px', fontSize: 12,
                  color: '#c4c4d8', overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: 1.5, margin: 0,
                }}>{m.code}</pre>
                <button onClick={() => onRunCode(m.code!)} style={{
                  marginTop: 6, background: '#4f46e5', border: 'none', color: '#fff', padding: '6px 14px',
                  borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                }}>Run this code</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #1e1e2e', display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="Describe what you want..."
          style={{
            flex: 1, background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 8,
            color: '#e4e4ef', padding: '8px 12px', fontSize: 13, outline: 'none',
            fontFamily: 'var(--font-sans, sans-serif)',
          }} />
        <button onClick={submit} style={{
          background: '#4f46e5', border: 'none', color: '#fff', padding: '8px 16px',
          borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600,
        }}>Send</button>
      </div>
    </div>
  )
}
