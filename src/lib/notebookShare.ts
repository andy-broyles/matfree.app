// Share-by-link for notebooks. The notebook travels in the URL fragment
// (#nb=...), which browsers never send to a server.
// Format: "z." + base64url(deflate(json)), or "j." + base64url(json) where
// CompressionStream is unavailable. Outputs are not included.

export interface SharedCell { type: 'code' | 'markdown'; content: string }
export interface SharedNotebook { name: string; cells: SharedCell[] }

export const SHARE_HASH_KEY = 'nb'

const MAX_CELLS = 1000
const MAX_DECODED_BYTES = 4_000_000

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      throw new Error('This notebook link is too large to open.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

function byteStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({ start(controller) { controller.enqueue(bytes as BufferSource); controller.close() } })
}

export async function encodeNotebook(nb: SharedNotebook): Promise<string> {
  const json = JSON.stringify({ v: 1, n: nb.name, c: nb.cells.map(c => [c.type === 'markdown' ? 'm' : 'c', c.content]) })
  const bytes = new TextEncoder().encode(json)
  if (typeof CompressionStream !== 'undefined') {
    try {
      const packed = await readAll(byteStream(bytes).pipeThrough(new CompressionStream('deflate')), Infinity)
      return 'z.' + toBase64Url(packed)
    } catch { /* fall through to uncompressed */ }
  }
  return 'j.' + toBase64Url(bytes)
}

export async function decodeNotebook(payload: string): Promise<SharedNotebook> {
  const dot = payload.indexOf('.')
  const kind = payload.slice(0, dot)
  let bytes: Uint8Array
  try { bytes = fromBase64Url(payload.slice(dot + 1)) } catch { throw new Error('This notebook link is damaged.') }
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed notebook links.')
    try {
      bytes = await readAll(byteStream(bytes).pipeThrough(new DecompressionStream('deflate')), MAX_DECODED_BYTES)
    } catch (e) {
      if (e instanceof Error && e.message.includes('too large')) throw e
      throw new Error('This notebook link is damaged.')
    }
  } else if (kind !== 'j') {
    throw new Error('This is not a MatFree notebook link.')
  }
  if (bytes.length > MAX_DECODED_BYTES) throw new Error('This notebook link is too large to open.')

  let data: unknown
  try { data = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('This notebook link is damaged.') }
  const obj = data as { v?: unknown; n?: unknown; c?: unknown }
  if (!obj || obj.v !== 1 || !Array.isArray(obj.c) || obj.c.length > MAX_CELLS) throw new Error('This notebook link is damaged.')
  const cells = obj.c.map((entry): SharedCell => {
    if (!Array.isArray(entry) || typeof entry[1] !== 'string') throw new Error('This notebook link is damaged.')
    return { type: entry[0] === 'm' ? 'markdown' : 'code', content: entry[1] }
  })
  const name = typeof obj.n === 'string' && obj.n.trim() ? obj.n.slice(0, 120) : 'Shared notebook'
  return { name, cells }
}

/** Reads the share payload from a location hash like "#nb=z.abc"; null if there isn't one. */
export function sharePayloadFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get(SHARE_HASH_KEY)
}
