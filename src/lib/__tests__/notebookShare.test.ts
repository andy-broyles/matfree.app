import { describe, it, expect, afterEach, vi } from 'vitest'
import { decodeNotebook, encodeNotebook, sharePayloadFromHash, type SharedNotebook } from '../notebookShare'

const sample: SharedNotebook = {
  name: 'Démo ∑ notebook',
  cells: [
    { type: 'markdown', content: '# Title\nπ ≈ 3.14159 — ünïcödé 😀' },
    { type: 'code', content: "x = linspace(0, 2*pi, 100);\nplot(x, sin(x))\ntitle('Hi')" },
    { type: 'code', content: '' },
  ],
}

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('notebook share links', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('round-trips code and markdown through a compressed, URL-safe payload', async () => {
    const payload = await encodeNotebook(sample)
    expect(payload).toMatch(/^z\.[A-Za-z0-9_-]+$/)
    expect(await decodeNotebook(payload)).toEqual(sample)
  })

  it('compresses repetitive notebooks well', async () => {
    const big: SharedNotebook = { name: 'big', cells: Array.from({ length: 50 }, (_, i) => ({ type: 'code', content: `y${i} = sin(linspace(0, 2*pi, 100));` })) }
    const payload = await encodeNotebook(big)
    expect(payload.length).toBeLessThan(JSON.stringify(big).length / 2)
    expect(await decodeNotebook(payload)).toEqual(big)
  })

  it('falls back to an uncompressed payload when CompressionStream is unavailable', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    const payload = await encodeNotebook(sample)
    expect(payload).toMatch(/^j\.[A-Za-z0-9_-]+$/)
    vi.unstubAllGlobals()
    expect(await decodeNotebook(payload)).toEqual(sample)
  })

  it('rejects damaged, foreign and malformed links', async () => {
    await expect(decodeNotebook('z.%%%')).rejects.toThrow(/damaged/)
    await expect(decodeNotebook('z.' + b64url('not deflate data'))).rejects.toThrow(/damaged/)
    await expect(decodeNotebook('q.abc')).rejects.toThrow(/not a MatFree notebook/)
    await expect(decodeNotebook('j.' + b64url('{"v":2,"c":[]}'))).rejects.toThrow(/damaged/)
    await expect(decodeNotebook('j.' + b64url('{"v":1,"c":[["c",5]]}'))).rejects.toThrow(/damaged/)
  })

  it('refuses payloads that inflate past the size limit', async () => {
    const zeros = new Uint8Array(6_000_000)
    const stream = new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate'))
    const packed = new Uint8Array(await new Response(stream).arrayBuffer())
    let bin = ''
    for (const byte of packed) bin += String.fromCharCode(byte)
    await expect(decodeNotebook('z.' + b64url(bin))).rejects.toThrow(/too large/)
  })

  it('defaults a missing name', async () => {
    const payload = 'j.' + b64url('{"v":1,"c":[["m","hi"]]}')
    expect(await decodeNotebook(payload)).toEqual({ name: 'Shared notebook', cells: [{ type: 'markdown', content: 'hi' }] })
  })

  it('reads the payload from the location hash', () => {
    expect(sharePayloadFromHash('#nb=z.abc-_')).toBe('z.abc-_')
    expect(sharePayloadFromHash('#other=1')).toBeNull()
    expect(sharePayloadFromHash('')).toBeNull()
  })
})
