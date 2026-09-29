interface ProjectPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode: 'read' }) => Promise<FileSystemDirectoryHandle>
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    excludeAcceptAllOption?: boolean
    types?: readonly { description?: string; accept: Record<string, readonly string[]> }[]
  }) => Promise<FileSystemFileHandle[]>
}

export class ProjectPickerUnsupportedError extends Error {
  constructor() {
    super('Folder access is unavailable in this browser. Open Forge in Chromium over HTTPS or localhost to select a Construct project.')
    this.name = 'ProjectPickerUnsupportedError'
  }
}

export function isDirectoryPickerSupported(): boolean {
  return typeof getDirectoryPicker() === 'function'
}

export function isArchiveHandlePickerSupported(): boolean {
  return typeof getArchivePicker() === 'function'
}

export async function pickProjectDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const picker = getDirectoryPicker()
  if (!picker) throw new ProjectPickerUnsupportedError()

  return await picker({ mode: 'read' })
}

export async function pickProjectArchiveHandle(): Promise<FileSystemFileHandle | null> {
  const picker = getArchivePicker()
  if (!picker) throw new Error('Native file picking is unavailable in this browser.')

  try {
    const [handle] = await picker({
      multiple: false,
      excludeAcceptAllOption: true,
      types: [{ description: 'Construct 3 project', accept: { 'application/octet-stream': ['.c3p'] } }],
    })
    return handle ?? null
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

function getDirectoryPicker(): ProjectPickerWindow['showDirectoryPicker'] {
  if (typeof window === 'undefined') return undefined
  const picker = (window as ProjectPickerWindow).showDirectoryPicker
  return picker?.bind(window)
}

function getArchivePicker(): ProjectPickerWindow['showOpenFilePicker'] {
  if (typeof window === 'undefined') return undefined
  const picker = (window as ProjectPickerWindow).showOpenFilePicker
  return picker?.bind(window)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
