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

export async function deleteNotebook(name: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOK_STORE, 'readwrite')
    tx.objectStore(NOTEBOOK_STORE).delete(name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
