/**
 * Every example a visitor can click on the homepage or playground must run.
 * These strings are read from the pages so a copied snippet cannot drift.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Interpreter } from '../interpreter'

function scanString(source: string, i: number): { value: string; end: number } | null {
  const q = source[i]
  if (q !== '"' && q !== "'") return null
  let out = ''
  for (let j = i + 1; j < source.length; j++) {
    const c = source[j]
    if (c === '\\') {
      const n = source[j + 1]
      out += n === 'n' ? '\n' : n === 't' ? '\t' : (n ?? '')
      j++
      continue
    }
    if (c === q) return { value: out, end: j + 1 }
    out += c
  }
  return null
}

function examplesIn(file: string): { name: string; code: string }[] {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8')
  const start = source.indexOf('const EXAMPLES')
  const end = source.indexOf('\nconst ', start + 1)
  const block = source.slice(start, end === -1 ? undefined : end)
  const items: { name: string; code: string }[] = []
  const re = /\b(?:name|title):\s*/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const name = scanString(block, match.index + match[0].length)
    if (!name) continue
    const codeAt = block.indexOf('code:', name.end)
    if (codeAt < 0 || codeAt - name.end > 80) continue
    const gap = block.slice(codeAt + 5).match(/^\s*/)
    const code = scanString(block, codeAt + 5 + (gap?.[0].length ?? 0))
    if (code) items.push({ name: name.value, code: code.value })
  }
  return items
}

const PAGES = [
  'src/app/page.tsx',
  'src/app/playground/page.tsx',
]

describe('shipped examples', () => {
  const examples = PAGES.flatMap(file => examplesIn(file).map(ex => ({ ...ex, file })))

  it('finds the homepage and playground examples', () => {
    expect(examples.filter(ex => ex.file.endsWith('page.tsx') && ex.file.includes('app/page')).length).toBe(4)
    expect(examples.filter(ex => ex.file.includes('playground')).length).toBeGreaterThan(30)
  })

  it('runs each example without an error', () => {
    const failures: string[] = []
    for (const ex of examples) {
      try {
        const interp = new Interpreter()
        interp.setOutput(() => {})
        interp.setPlotCallback(() => {})
        interp.execute(ex.code)
      } catch (e) {
        failures.push(`${ex.file} · ${ex.name}: ${(e as Error).message}`)
      }
    }
    expect(failures).toEqual([])
  }, 60_000)
})
