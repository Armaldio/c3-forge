import { BrowserProjectFileSystem } from './browser-project-file-system'

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode: 'read' }) => Promise<FileSystemDirectoryHandle>
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

export async function pickProjectFileSystem(): Promise<BrowserProjectFileSystem> {
  const picker = getDirectoryPicker()
  if (!picker) throw new ProjectPickerUnsupportedError()

  const directory = await picker({ mode: 'read' })
  return new BrowserProjectFileSystem(directory)
}

function getDirectoryPicker(): DirectoryPickerWindow['showDirectoryPicker'] {
  if (typeof window === 'undefined') return undefined
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  return picker?.bind(window)
}
