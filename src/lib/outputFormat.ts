import katex from 'katex'
import type { Plot3DData } from '@/components/Plot3D'

export type ClassifiedOutput =
  | { type: 'text'; text: string }
  | { type: 'latex'; html: string }
  | { type: 'plot3d'; plot3d: Plot3DData }
  | { type: 'audio'; audioSrc: string }

export function symToLatex(expr: string): string {
  let s = expr
  s = s.replace(/\bsin\b/g, '\\sin').replace(/\bcos\b/g, '\\cos').replace(/\btan\b/g, '\\tan')
  s = s.replace(/\bexp\b/g, '\\exp').replace(/\bln\b/g, '\\ln').replace(/\blog\b/g, '\\log')
  s = s.replace(/\bsqrt\b/g, '\\sqrt')
  s = s.replace(/\bpi\b/g, '\\pi').replace(/\binf\b/g, '\\infty')
  s = s.replace(/\babs\b/g, '|').replace(/\^(\w)/g, '^{$1}').replace(/\^(\([^)]+\))/g, '^{$1}')
  s = s.replace(/\*/g, ' \\cdot ')
  return s
}

/** Turns one engine print into display form; the engine marks rich output with __audio:, __plot3d: and __sym: prefixes. */
export function classifyOutput(text: string): ClassifiedOutput {
  if (text.startsWith('__audio:')) return { type: 'audio', audioSrc: text.slice(8).trim() }
  if (text.startsWith('__plot3d:')) {
    try { return { type: 'plot3d', plot3d: JSON.parse(text.slice(9).trim()) as Plot3DData } }
    catch { return { type: 'text', text } }
  }
  if (text.includes('__sym:')) {
    const m = text.match(/__sym:(.+)/)
    if (m) {
      try { return { type: 'latex', html: katex.renderToString(symToLatex(m[1].trim()), { throwOnError: false, displayMode: true }) } }
      catch { return { type: 'text', text } }
    }
  }
  return { type: 'text', text }
}

/** Appends items, merging consecutive text entries so long-running prints stay one DOM node. */
export function appendMerged<T extends { type: string; text?: string }>(prev: T[], next: T[], textType: T['type']): T[] {
  if (next.length === 0) return prev
  const out = prev.slice()
  for (const item of next) {
    const last = out[out.length - 1]
    if (item.type === textType && last && last.type === textType) out[out.length - 1] = { ...last, text: (last.text ?? '') + (item.text ?? '') }
    else out.push(item)
  }
  return out
}
