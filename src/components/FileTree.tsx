'use client'

import { useState, useEffect, useCallback } from 'react'

export interface MFFile { name: string; content: string; modified: number }

const DB_NAME = 'matfree_fs'
const STORE = 'files'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'name' }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAllFiles(): Promise<MFFile[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result.sort((a: MFFile, b: MFFile) => b.modified - a.modified))
    req.onerror = () => reject(req.error)
  })
}

async function saveFile(file: MFFile): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(file)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteFile(name: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

interface Props {
  visible: boolean
  onOpen: (file: MFFile) => void
  currentCode: string
  currentName: string
  onNameChange: (name: string) => void
}

export default function FileTree({ visible, onOpen, currentCode, currentName, onNameChange }: Props) {
  const [files, setFiles] = useState<MFFile[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)

  const refresh = useCallback(async () => { setFiles(await getAllFiles()) }, [])
  useEffect(() => { if (visible) refresh() }, [visible, refresh])

  const handleSave = useCallback(async () => {
    const name = currentName || 'untitled.m'
    await saveFile({ name, content: currentCode, modified: Date.now() })
    refresh()
  }, [currentCode, currentName, refresh])

  const handleNew = useCallback(async () => {
    const name = newName.trim() || `script_${Date.now()}.m`
    const finalName = name.endsWith('.m') ? name : name + '.m'
    await saveFile({ name: finalName, content: '% New script\n', modified: Date.now() })
    setNewName('')
    refresh()
    onOpen({ name: finalName, content: '% New script\n', modified: Date.now() })
    onNameChange(finalName)
  }, [newName, refresh, onOpen, onNameChange])

  const handleDelete = useCallback(async (name: string) => {
    await deleteFile(name)
    refresh()
  }, [refresh])

  const handleRename = useCallback(async (oldName: string, newN: string) => {
    const file = files.find(f => f.name === oldName)
    if (!file) return
    await deleteFile(oldName)
    const renamed = { ...file, name: newN.endsWith('.m') ? newN : newN + '.m', modified: Date.now() }
    await saveFile(renamed)
    setRenaming(null)
    refresh()
    if (currentName === oldName) onNameChange(renamed.name)
  }, [files, currentName, onNameChange, refresh])

  if (!visible) return null

  const timeAgo = (ms: number) => {
    const d = Date.now() - ms
    if (d < 60000) return 'just now'
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
    return `${Math.floor(d / 86400000)}d ago`
  }

  return (
    <div style={{
      background: '#0e0e16', borderRight: '1px solid #1e1e2e', padding: 12,
      width: '100%', height: '100%', overflow: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: '#e4e4ef', fontSize: 13 }}>Files</span>
        <button onClick={handleSave} style={{
          background: '#4f46e5', border: 'none', color: '#fff', padding: '4px 10px',
          borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 600,
        }}>Save</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="new_script.m"
          onKeyDown={e => { if (e.key === 'Enter') handleNew() }}
          style={{
            flex: 1, background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 5,
            color: '#e4e4ef', padding: '4px 8px', fontSize: 11, outline: 'none', fontFamily: 'var(--font-mono)',
          }} />
        <button onClick={handleNew} style={{
          background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8',
          padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
        }}>+</button>
      </div>

      {files.length === 0 && (
        <div style={{ color: '#3a3a52', fontSize: 12, fontStyle: 'italic', padding: 8 }}>
          No saved files yet. Click Save to store your current script.
        </div>
      )}

      {files.map(f => (
        <div key={f.name} style={{
          padding: '8px 10px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
          background: f.name === currentName ? '#1e1e2e' : 'transparent',
          border: f.name === currentName ? '1px solid #3a3a52' : '1px solid transparent',
        }} onClick={() => { onOpen(f); onNameChange(f.name) }}>
          {renaming === f.name ? (
            <input autoFocus defaultValue={f.name}
              onBlur={e => handleRename(f.name, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(f.name, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenaming(null) }}
              style={{ background: '#0e0e16', border: '1px solid #4f46e5', borderRadius: 4, color: '#e4e4ef', padding: '2px 6px', fontSize: 12, width: '100%', fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          ) : (
            <>
              <div style={{ color: '#e4e4ef', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{f.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#3a3a52', fontSize: 10 }}>{timeAgo(f.modified)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setRenaming(f.name) }} style={{ background: 'none', border: 'none', color: '#666680', cursor: 'pointer', fontSize: 10, padding: '2px 4px' }}>rename</button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(f.name) }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, padding: '2px 4px' }}>del</button>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export { getAllFiles, saveFile, deleteFile }
