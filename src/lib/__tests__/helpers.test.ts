import { describe, it, expect } from 'vitest'
import { csvToAssignment, isValidIdentifier } from '../csvImport'
import { appendMerged, classifyOutput, upsertPlot } from '../outputFormat'
import { Interpreter, Value } from '@/engine'
import type { PlotFigure } from '@/engine/plot'
import { summarizeValue } from '@/engine/workspace'

describe('csvToAssignment', () => {
  it('skips header rows, keeps missing cells as NaN, and builds runnable code', () => {
    const csv = csvToAssignment('my data.csv', 'time,value\n0,1.5\n1,\n2,"3"\n')!
    expect(csv).toMatchObject({ varName: 'my_data', rows: 3, cols: 2 })
    const interp = new Interpreter()
    interp.setOutput(() => {})
    interp.execute(csv.code)
    const m = interp.getGlobalEnv().get('my_data')!.matrix()
    expect([m.rows, m.cols]).toEqual([3, 2])
    expect(m.get(0, 1)).toBe(1.5)
    expect(Number.isNaN(m.get(1, 1))).toBe(true)
    expect(m.get(2, 1)).toBe(3)
  })

  it('makes a valid variable name from any file name', () => {
    expect(csvToAssignment('2024-results.csv', '1,2')!.varName).toBe('x2024_results')
    expect(csvToAssignment('.csv', '1,2')!.varName).toBe('data')
  })

  it('returns null when there is no numeric data', () => {
    expect(csvToAssignment('a.csv', 'name,city\nann,paris')).toBeNull()
  })

  it('validates identifiers', () => {
    expect(isValidIdentifier('data_1')).toBe(true)
    expect(isValidIdentifier('1data')).toBe(false)
    expect(isValidIdentifier('x = 1; y')).toBe(false)
  })
})

describe('output formatting', () => {
  it('classifies rich engine output', () => {
    expect(classifyOutput('__audio:data:audio/wav;base64,AAA')).toEqual({ type: 'audio', audioSrc: 'data:audio/wav;base64,AAA' })
    expect(classifyOutput('__plot3d:{"type":"surf"}')).toEqual({ type: 'plot3d', plot3d: { type: 'surf' } })
    expect(classifyOutput('__plot3d:{broken')).toEqual({ type: 'text', text: '__plot3d:{broken' })
    expect(classifyOutput('__sym:x^2').type).toBe('latex')
    expect(classifyOutput('ans = 3\n')).toEqual({ type: 'text', text: 'ans = 3\n' })
  })

  it('merges consecutive text so long output stays one block', () => {
    type Item = { type: 'output' | 'plot'; text?: string }
    let items: Item[] = []
    items = appendMerged<Item>(items, [{ type: 'output', text: 'a\n' }, { type: 'output', text: 'b\n' }], 'output')
    items = appendMerged<Item>(items, [{ type: 'plot' }, { type: 'output', text: 'c\n' }], 'output')
    items = appendMerged<Item>(items, [{ type: 'output', text: 'd\n' }], 'output')
    expect(items).toEqual([{ type: 'output', text: 'a\nb\n' }, { type: 'plot' }, { type: 'output', text: 'c\nd\n' }])
  })

  it('replaces a figure when title and labels update it', () => {
    type Item = { type: 'output' | 'plot'; figure?: PlotFigure }
    const first = { id: 1, title: 'Sine Wave' } as PlotFigure
    const titled = { id: 1, title: 'Sine Wave', xlabel: 'x' } as PlotFigure
    const other = { id: 2, title: 'Other' } as PlotFigure
    let items: Item[] = [{ type: 'output' }]
    items = upsertPlot(items, first, 'plot')
    items = upsertPlot(items, titled, 'plot')
    items = upsertPlot(items, other, 'plot')
    expect(items.map(item => item.figure?.id)).toEqual([undefined, 1, 2])
    expect(items[1].figure).toEqual(titled)
  })

  it('shows a symbolic result without the internal marker', () => {
    const summary = summarizeValue('ans', Value.fromString('__sym:6*x + 4'))
    expect(summary.preview).toBe("'6*x + 4'")
    expect(summary.size).toBe('1x7')
  })
})
