// Notebook persistence via IndexedDB

export interface StoredCell {
  id: string
  type: 'code' | 'markdown'
  content: string
  output: { type: string; text?: string; figure?: unknown; plot3d?: unknown; html?: string; audioSrc?: string }[]
}

export interface MFNotebook {
  name: string
  cells: StoredCell[]
  modified: number
}

const DB_NAME = 'matfree_fs'
const NOTEBOOK_STORE = 'notebooks'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(NOTEBOOK_STORE)) {
        db.createObjectStore(NOTEBOOK_STORE, { keyPath: 'name' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllNotebooks(): Promise<MFNotebook[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOK_STORE, 'readonly')
    const req = tx.objectStore(NOTEBOOK_STORE).getAll()
    req.onsuccess = () =>
      resolve((req.result as MFNotebook[]).sort((a, b) => b.modified - a.modified))
    req.onerror = () => reject(req.error)
  })
}

export async function saveNotebook(nb: MFNotebook): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOK_STORE, 'readwrite')
    tx.objectStore(NOTEBOOK_STORE).put({ ...nb, modified: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadNotebook(name: string): Promise<MFNotebook | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOK_STORE, 'readonly')
    const req = tx.objectStore(NOTEBOOK_STORE).get(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// The working copy is autosaved to localStorage so a reload or crash never loses it.
const DRAFT_KEY = 'mf_notebook_draft'

export interface NotebookDraft {
  name: string
  cells: StoredCell[]
}

// JSON has no NaN/Infinity; plot data needs them (NaN gaps in lines).
const encodeNonFinite = (_: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v)
const decodeNonFinite = (_: string, v: unknown) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    if (typeof o.__num === 'string' && Object.keys(o).length === 1) return Number(o.__num)
  }
  return v
}

export function loadDraft(): NotebookDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw, decodeNonFinite) as NotebookDraft
    if (!d || typeof d.name !== 'string' || !Array.isArray(d.cells)) return null
    return d
  } catch {
    return null
  }
}

export function saveDraft(draft: NotebookDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft, encodeNonFinite))
  } catch {
    // Over quota (usually big plots): keep the code and text, drop the outputs.
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, cells: draft.cells.map(c => ({ ...c, output: [] })) }))
    } catch { /* storage unavailable */ }
  }
}

export async function deleteNotebook(name: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOK_STORE, 'readwrite')
    tx.objectStore(NOTEBOOK_STORE).delete(name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
