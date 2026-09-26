import type { ProjectFileSystem } from '../../core/filesystem'
import {
  joinProjectPaths,
  normalizeProjectPath,
  resolveProjectPath,
} from '../../core/paths'

/** A read-only adapter over a directory selected by the user. */
export class BrowserProjectFileSystem implements ProjectFileSystem {
  readonly rootName: string
  private readonly root: FileSystemDirectoryHandle

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root
    this.rootName = root.name
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
    if (normalized === '') return true

    try {
      await this.fileHandle(normalized)
      return true
    } catch (error) {
      if (!isExpectedLookupFailure(error)) throw error
    }

    try {
      await this.directoryHandle(normalized)
      return true
    } catch (error) {
      if (isExpectedLookupFailure(error)) return false
      throw error
    }
  }

  async readText(path: string): Promise<string> {
    const file = await this.fileHandle(path)
    return (await file.getFile()).text()
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const file = await this.fileHandle(path)
    return new Uint8Array(await (await file.getFile()).arrayBuffer())
  }

  async listFiles(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory)
    const handle = await this.directoryHandle(normalized)
    const paths: string[] = []

    for await (const entry of handle.values()) {
      if (entry.kind === 'file') paths.push(this.joinPaths(normalized, entry.name))
    }

    return paths.sort((left, right) => left.localeCompare(right))
  }

  async listDirectories(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory)
    const handle = await this.directoryHandle(normalized)
    const paths: string[] = []

    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') paths.push(this.joinPaths(normalized, entry.name))
    }

    return paths.sort((left, right) => left.localeCompare(right))
  }

  private async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const normalized = this.normalizePath(path)
    const parts = normalized.split('/').filter(Boolean)
    const filename = parts.pop()
    if (!filename) throw new Error('A file path must name a file inside the project folder.')

    let directory = this.root
    for (const segment of parts) directory = await directory.getDirectoryHandle(segment)
    return directory.getFileHandle(filename)
  }

  private async directoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    const normalized = this.normalizePath(path)
    let directory = this.root
    for (const segment of normalized.split('/').filter(Boolean)) {
      directory = await directory.getDirectoryHandle(segment)
    }
    return directory
  }
}

function isExpectedLookupFailure(error: unknown): boolean {
  return error instanceof DOMException && ['NotFoundError', 'TypeMismatchError'].includes(error.name)
}
