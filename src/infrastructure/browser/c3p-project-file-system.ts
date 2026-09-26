import { unzip } from 'fflate'
import type { ProjectFileSystem } from '../../core/filesystem'
import {
  joinProjectPaths,
  normalizeProjectPath,
  resolveProjectPath,
} from '../../core/paths'

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
const MAX_ENTRY_BYTES = 1024 * 1024 * 1024
const MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 100_000

/** Read-only, in-memory view of a .c3p ZIP archive. */
export class C3pProjectFileSystem implements ProjectFileSystem {
  readonly rootName: string
  readonly #files: ReadonlyMap<string, Uint8Array>
  readonly #directories: ReadonlySet<string>

  constructor(rootName: string, files: ReadonlyMap<string, Uint8Array>) {
    this.rootName = rootName
    this.#files = files
    const directories = new Set<string>([''])
    for (const path of files.keys()) {
      const segments = path.split('/')
      segments.pop()
      for (let end = 1; end <= segments.length; end += 1) directories.add(segments.slice(0, end).join('/'))
    }
    this.#directories = directories
  }

  normalizePath(path: string): string {
    return normalizeProjectPath(path)
  }

  joinPaths(...segments: readonly string[]): string {
    return joinProjectPaths(...segments)
  }

  resolve(fromPath: string, relativePath: string): string {
    return resolveProjectPath(fromPath, relativePath)
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path)
    return this.#files.has(normalized) || this.#directories.has(normalized)
  }

  async readText(path: string): Promise<string> {
    const bytes = this.#files.get(this.normalizePath(path))
    if (!bytes) throw new Error(`Project file was not found in the selected .c3p archive: ${path}`)
    return new TextDecoder().decode(bytes)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const bytes = this.#files.get(this.normalizePath(path))
    if (!bytes) throw new Error(`Project file was not found in the selected .c3p archive: ${path}`)
    return bytes.slice()
  }

  async listFiles(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory)
    return [...this.#files.keys()]
      .filter((path) => parentPath(path) === normalized)
      .sort((left, right) => left.localeCompare(right))
  }

  async listDirectories(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory)
    return [...this.#directories]
      .filter((path) => path !== '' && parentPath(path) === normalized)
      .sort((left, right) => left.localeCompare(right))
  }
}

/** Decode and validate a .c3p archive without extracting it to disk. */
export async function createC3pProjectFileSystem(fileName: string, archive: Uint8Array): Promise<C3pProjectFileSystem> {
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('This .c3p archive is larger than the 1 GiB in-browser limit.')
  }

  const paths = new Set<string>()
  let observedEntryCount = 0
  let estimatedExpandedBytes = 0
  let unsafePathError: Error | null = null
  let sizeLimitError: Error | null = null
  let entryCountError: Error | null = null

  const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    try {
      unzip(archive, {
        filter: (entry) => {
          observedEntryCount += 1
          if (observedEntryCount > MAX_ARCHIVE_ENTRIES) {
            entryCountError = new Error(`This .c3p archive contains more than ${MAX_ARCHIVE_ENTRIES.toLocaleString()} entries.`)
            return false
          }

          let path: string
          try {
            path = normalizeArchivePath(entry.name)
          } catch (error) {
            unsafePathError = error instanceof Error ? error : new Error('The .c3p archive contains an unsafe path.')
            return false
          }

          if (isDirectoryEntry(entry.name) || isArchiveMetadata(path)) return false
          if (paths.has(path)) {
            unsafePathError = new Error(`The .c3p archive contains a duplicate path: ${path}`)
            return false
          }
          paths.add(path)

          if (entry.originalSize > MAX_ENTRY_BYTES || estimatedExpandedBytes + entry.originalSize > MAX_EXPANDED_BYTES) {
            sizeLimitError = new Error('This .c3p archive expands beyond the 2 GiB in-browser limit.')
            return false
          }
          estimatedExpandedBytes += entry.originalSize
          return true
        },
      }, (error, files) => {
        if (error) reject(error)
        else if (unsafePathError) reject(unsafePathError)
        else if (sizeLimitError) reject(sizeLimitError)
        else if (entryCountError) reject(entryCountError)
        else resolve(files ?? {})
      })
    } catch (error) {
      reject(error)
    }
  })

  const fileEntries = Object.entries(unzipped).map(([rawPath, bytes]) => [normalizeArchivePath(rawPath), bytes] as const)
  const manifestPaths = fileEntries.map(([path]) => path).filter((path) => path === 'project.c3proj' || path.endsWith('/project.c3proj'))
  const manifestPath = manifestPaths.includes('project.c3proj') ? 'project.c3proj' : manifestPaths[0]
  if (!manifestPath) throw new Error('The selected .c3p archive does not contain project.c3proj.')
  if (manifestPath !== 'project.c3proj' && manifestPaths.length !== 1) {
    throw new Error('The selected .c3p archive contains more than one project.c3proj and cannot be opened unambiguously.')
  }

  const projectPrefix = manifestPath === 'project.c3proj' ? '' : manifestPath.slice(0, -'/project.c3proj'.length)
  const prefix = projectPrefix ? `${projectPrefix}/` : ''
  const projectFiles = new Map<string, Uint8Array>()
  for (const [path, bytes] of fileEntries) {
    if (projectPrefix && !path.startsWith(prefix)) continue
    const projectPath = projectPrefix ? path.slice(prefix.length) : path
    if (projectPath) projectFiles.set(projectPath, bytes)
  }

  const rootName = fileName.replaceAll('\\', '/').split('/').at(-1)?.replace(/\.c3p$/i, '') || 'Construct project'
  return new C3pProjectFileSystem(rootName, projectFiles)
}

export async function createC3pProjectFileSystemFromFile(file: File): Promise<C3pProjectFileSystem> {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error('This .c3p archive is larger than the 1 GiB in-browser limit.')
  }
  return await createC3pProjectFileSystem(file.name, new Uint8Array(await file.arrayBuffer()))
}

function normalizeArchivePath(path: string): string {
  const normalizedInput = path.replaceAll('\\', '/')
  if (normalizedInput.startsWith('/') || /^[a-z]:\//i.test(normalizedInput)) {
    throw new Error(`The .c3p archive contains an absolute path: ${path}`)
  }
  return normalizeProjectPath(normalizedInput)
}

function isDirectoryEntry(path: string): boolean {
  return path.endsWith('/') || path.endsWith('\\')
}

function isArchiveMetadata(path: string): boolean {
  return path === '__MACOSX' || path.startsWith('__MACOSX/') || path.split('/').some((segment) => segment === '.DS_Store')
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}
