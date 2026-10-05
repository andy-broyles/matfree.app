import { describe, it, expect } from 'vitest'
import { SessionHost, type SessionHostOptions, type SessionResponse } from '../session'
import { Interpreter } from '../interpreter'
import { restoreWorkspace, snapshotWorkspace, summarizeWorkspace } from '../workspace'

type Done = Extract<SessionResponse, { type: 'done' }>

function makeHost(opts: SessionHostOptions = {}) {
  const messages: SessionResponse[] = []
  const transfers: Transferable[][] = []
  const host = new SessionHost((msg, transfer) => { messages.push(structuredClone(msg)); transfers.push(transfer ?? []) }, opts)
  let id = 0
  const run = (code: string, strings?: Record<string, string>) => {
    const start = messages.length
    host.handle({ type: 'run', id: ++id, code, strings })
    const mine = messages.slice(start)
    const done = mine.find((m): m is Done => m.type === 'done')!
    const text = mine.flatMap(m => (m.type === 'output' ? m.texts : [])).join('')
    return { done, text, messages: mine, transfer: transfers[transfers.length - 1] }
  }
  const reset = () => {
    const start = messages.length
    host.handle({ type: 'reset', id: ++id })
    return messages.slice(start).find((m): m is Done => m.type === 'done')!
  }
  return { host, run, reset }
}

const preview = (done: Done, name: string) => done.vars.find(v => v.name === name)?.preview

describe('SessionHost', () => {
  it('keeps the workspace between runs', () => {
    const { run } = makeHost()
    run('x = 21;')
    const { done, text } = run("y = x * 2; fprintf('%d\\n', y)")
    expect(done.error).toBeUndefined()
    expect(text).toBe('42\n')
    expect(preview(done, 'y')).toBe('42')
  })

  it('reports runtime errors and keeps assignments made before the error', () => {
    const { run } = makeHost()
    const { done } = run('a = 1;\nb = no_such_function(2);')
    expect(done.error).toMatch(/^Error: /)
    expect(preview(done, 'a')).toBe('1')
    expect(preview(done, 'b')).toBeUndefined()
  })

  it('includes the line number for parse errors', () => {
    const { run } = makeHost()
    expect(run('x = 1;\ny = (2 + ;').done.error).toMatch(/^Parse Error \(line 2\)/)
  })

  it('makes injected strings available during the run only', () => {
    const { run } = makeHost()
    const first = run('n = length(__s);', { __s: 'hello' })
    expect(preview(first.done, 'n')).toBe('5')
    expect(first.done.vars.some(v => v.name === '__s')).toBe(false)
    expect(preview(run("z = exist('__s');").done, 'z')).toBe('0')
  })

  it('hides built-in constants until they are reassigned', () => {
    const { run } = makeHost()
    const { done } = run('for i = 1:3\nend\nw = pi;')
    const names = done.vars.map(v => v.name)
    expect(names).toContain('i')
    expect(preview(done, 'i')).toBe('3')
    expect(names).not.toContain('pi')
    expect(names).not.toContain('j')
  })

  it('streams text and plots in program order', () => {
    const { run } = makeHost()
    const { messages } = run("disp('a'); plot([1 2], [3 4]); disp('b')")
    const kinds = messages.map(m => (m.type === 'output' ? `text:${m.texts.join('')}` : m.type))
    expect(kinds).toEqual(['text:a\n', 'plot', 'text:b\n', 'done'])
  })

  it('routes file downloads to the page instead of the DOM', () => {
    const { run } = makeHost()
    const { messages } = run("writematrix([1 2; 3 4], 'm.csv');")
    const dl = messages.find(m => m.type === 'download')
    expect(dl).toMatchObject({ type: 'download', name: 'm.csv', mime: 'text/csv', content: '1,2\n3,4' })
  })

  it('reset gives a fresh workspace', () => {
    const { run, reset } = makeHost()
    run('x = 1;')
    expect(reset().vars).toEqual([])
    expect(preview(run("q = exist('x');").done, 'q')).toBe('0')
  })

  it('only sends a snapshot when the workspace changed', () => {
    const { run } = makeHost()
    const first = run('x = 1;')
    expect(first.done.snapshot).toBeTruthy()
    expect(first.transfer.length).toBeGreaterThan(0)
    expect(run('% nothing to do').done.snapshot).toBeUndefined()
  })

  it('reports a workspace too large to snapshot as null', () => {
    const { run } = makeHost({ maxSnapshotElements: 50 })
    expect(run('A = zeros(1, 100);').done.snapshot).toBeNull()
  })

  it('interrupts runaway code when a time limit is set', () => {
    const { run } = makeHost({ timeLimitMs: 50 })
    expect(run('while true\nend').done.error).toMatch(/time limit/i)
  })
})

describe('workspace snapshots', () => {
  it('restores every value type, closures and user functions into a fresh interpreter', () => {
    const a = new Interpreter()
    a.setOutput(() => {})
    a.execute(`
      function f = makeAdder(n)
        f = @(x) x + n;
      end
      function r = sq(x)
        r = x^2;
      end
      M = [1 2; 3 4];
      z = 3 + 4i;
      s = 'hello';
      c = {1, 'two', [3 4 5]};
      st.name = 'probe';
      st.vals = [1 2 3];
      e = [];
      h = @sin;
      k = 10;
      g = @(x) x * k;
      add5 = makeAdder(5);
      t = true;
    `)
    const res = snapshotWorkspace(a)
    expect(res).not.toBeNull()
    // Simulate the trip through postMessage.
    const snap = structuredClone(res!.snapshot)

    const b = new Interpreter()
    b.setOutput(() => {})
    restoreWorkspace(b, snap)
    b.execute(`
      r1 = M(2, 1);
      r2 = abs(z);
      r3 = length(s);
      tmp = c{3};
      r4 = tmp(2);
      sv = st.vals;
      r5 = sv(3);
      r6 = h(0);
      r7 = g(2);
      r8 = add5(1);
      r9 = sq(7);
      r10 = numel(e);
      r11 = t + 0;
      k = 100;
      r12 = g(2);
      add7 = makeAdder(7);
      r13 = add7(1);
    `)
    const num = (n: string) => b.getGlobalEnv().get(n)!.toScalar()
    expect(num('r1')).toBe(3)
    expect(num('r2')).toBe(5)
    expect(num('r3')).toBe(5)
    expect(num('r4')).toBe(4)
    expect(num('r5')).toBe(3)
    expect(num('r6')).toBe(0)
    expect(num('r7')).toBe(20)
    expect(num('r8')).toBe(6)
    expect(num('r9')).toBe(49)
    expect(num('r10')).toBe(0)
    expect(num('r11')).toBe(1)
    // Anonymous functions read the live workspace, as before the restore.
    expect(num('r12')).toBe(200)
    expect(num('r13')).toBe(8)
    expect(b.getGlobalEnv().get('s')!.string()).toBe('hello')
    expect(b.getGlobalEnv().get('st')!.struct().name.string()).toBe('probe')

    const summary = summarizeWorkspace(b.getGlobalEnv())
    expect(summary.find(v => v.name === 'z')?.preview).toBe('3 + 4i')
    expect(summary.find(v => v.name === 'add5')?.typeLabel).toBe('function_handle')
    expect(summary.some(v => v.name === 'pi')).toBe(false)
  })

  it('returns null instead of a partial snapshot when over the size cap', () => {
    const a = new Interpreter()
    a.setOutput(() => {})
    a.execute('A = ones(10, 10); B = ones(10, 10);')
    expect(snapshotWorkspace(a, 150)).toBeNull()
    expect(snapshotWorkspace(a, 1000)).not.toBeNull()
  })
})
