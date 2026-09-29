export type ProjectFileSource =
  | {
      readonly kind: 'folder'
      readonly displayName: string
      readonly handle: FileSystemDirectoryHandle
    }
  | {
      readonly kind: 'archive-handle'
      readonly displayName: string
      readonly handle: FileSystemFileHandle
    }

export interface TemporaryArchiveSource {
  readonly kind: 'archive-file'
  readonly displayName: string
  readonly file: File
}

export type ProjectSourceReference = ProjectFileSource | TemporaryArchiveSource

export interface SavedProjectSource {
  readonly sessionId: string
  readonly source: ProjectFileSource
}

interface StoredProjectSource extends SavedProjectSource {
  readonly key: 'active'
  readonly version: 1
}

const DATABASE_NAME = 'c3-forge'
const DATABASE_VERSION = 1
const OBJECT_STORE = 'project-source'
const ACTIVE_KEY = 'active'

interface PermissionAwareHandle extends FileSystemHandle {
  queryPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

export async function loadSavedProjectSource(): Promise<SavedProjectSource | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OBJECT_STORE, 'readonly')
    const record = await requestResult(transaction.objectStore(OBJECT_STORE).get(ACTIVE_KEY))
    if (record === undefined) return null
    if (!isStoredProjectSource(record)) {
      await clearSavedProjectSource()
      return null
    }
    return { sessionId: record.sessionId, source: record.source }
  } finally {
    database.close()
  }
}

export async function saveProjectSource(record: SavedProjectSource): Promise<void> {
  if (!isSavedProjectSource(record)) throw new Error('The selected project source cannot be saved for reload.')

  const database = await openDatabase()
  try {
    await completeTransaction(database, (store) => {
      const stored: StoredProjectSource = { ...record, key: ACTIVE_KEY, version: 1 }
      store.put(stored)
    })
  } finally {
    database.close()
  }
}

export async function clearSavedProjectSource(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const database = await openDatabase()
  try {
    await completeTransaction(database, (store) => store.delete(ACTIVE_KEY))
  } finally {
    database.close()
  }
}

export async function queryProjectSourcePermission(source: ProjectFileSource): Promise<PermissionState> {
  const handle = source.handle as PermissionAwareHandle
  if (typeof handle.queryPermission !== 'function') return 'prompt'
  return await handle.queryPermission({ mode: 'read' })
}

/** Call from a user gesture because browsers may show a permission prompt. */
export async function requestProjectSourcePermission(source: ProjectFileSource): Promise<PermissionState> {
  const handle = source.handle as PermissionAwareHandle
  if (typeof handle.requestPermission !== 'function') return 'denied'
  return await handle.requestPermission({ mode: 'read' })
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser cannot remember a project source across reloads.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(OBJECT_STORE)) database.createObjectStore(OBJECT_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open saved project access.'))
    request.onblocked = () => reject(new Error('Saved project access is blocked by another open Forge tab.'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not read saved project access.'))
  })
}

function completeTransaction(
  database: IDBDatabase,
  update: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not update saved project access.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update saved project access.'))
    update(transaction.objectStore(OBJECT_STORE))
  })
}

function isSavedProjectSource(value: unknown): value is SavedProjectSource {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    && value.sessionId.length <= 128
    && isProjectSourceReference(value.source)
}

function isStoredProjectSource(value: unknown): value is StoredProjectSource {
  return isRecord(value)
    && value.key === ACTIVE_KEY
    && value.version === 1
    && isSavedProjectSource(value)
}

function isProjectSourceReference(value: unknown): value is ProjectFileSource {
  if (!isRecord(value)
    || typeof value.displayName !== 'string'
    || value.displayName.length === 0
    || value.displayName.length > 512) return false

  if (value.kind === 'folder') {
    return isRecord(value.handle)
      && value.handle.kind === 'directory'
      && typeof value.handle.name === 'string'
      && typeof value.handle.getDirectoryHandle === 'function'
      && typeof value.handle.queryPermission === 'function'
  }
  if (value.kind === 'archive-handle') {
    return isRecord(value.handle)
      && value.handle.kind === 'file'
      && typeof value.handle.name === 'string'
      && typeof value.handle.getFile === 'function'
      && typeof value.handle.queryPermission === 'function'
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
