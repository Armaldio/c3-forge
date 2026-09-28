/** Read-only project boundary. All paths are normalized, root-relative paths. */
export interface ProjectFileSystem {
  readonly rootName: string;
  exists(path: string): Promise<boolean>;
  /** Read-only file metadata. Does not read the file contents. */
  stat?(path: string): Promise<ProjectFileInfo>;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  /** List direct file children as normalized root-relative paths. */
  listFiles(directory?: string): Promise<readonly string[]>;
  /** List direct directory children as normalized root-relative paths. */
  listDirectories(directory?: string): Promise<readonly string[]>;
  normalizePath(path: string): string;
  joinPaths(...segments: readonly string[]): string;
  /** Resolve a relative reference from a root-relative file path. */
  resolve(fromPath: string, relativePath: string): string;
}

export interface ProjectFileInfo {
  readonly size: number;
}
