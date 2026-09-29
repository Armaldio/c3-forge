import { loadProject, searchEntities } from '../core'
import type { ProjectAnalysis, ProjectLoadStage } from '../core'
import type { ProjectFileSystem } from '../core/filesystem'
import { createC3pProjectFileSystemFromFile } from '../infrastructure/browser/c3p-project-file-system'
import { BrowserProjectFileSystem } from '../infrastructure/browser/browser-project-file-system'
import {
  isArchiveHandlePickerSupported,
  isDirectoryPickerSupported,
  pickProjectArchiveHandle,
  pickProjectDirectoryHandle,
} from '../infrastructure/browser/project-directory-picker'
import type {
  ProjectFileSource,
  ProjectSourceReference,
} from '../infrastructure/browser/project-source-store'

export {
  clearSavedProjectSource,
  loadSavedProjectSource,
  queryProjectSourcePermission,
  requestProjectSourcePermission,
  saveProjectSource,
} from '../infrastructure/browser/project-source-store'
export type { SavedProjectSource } from '../infrastructure/browser/project-source-store'

export interface OpenedProject {
  readonly analysis: ProjectAnalysis
  readonly filesystem: ProjectFileSystem
  readonly source: ProjectFileSource | null
}

export function canOpenProjectFolder(): boolean {
  return isDirectoryPickerSupported()
}

export function canOpenProjectArchiveWithNativePicker(): boolean {
  return isArchiveHandlePickerSupported()
}

export async function openProjectFolder(
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<OpenedProject | null> {
  try {
    const handle = await pickProjectDirectoryHandle()
    return await loadProjectSource({ kind: 'folder', displayName: handle.name, handle }, onProgress)
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

export async function openProjectArchive(
  file: File,
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<OpenedProject> {
  if (!file.name.toLowerCase().endsWith('.c3p')) throw new Error('Choose a Construct 3 .c3p project archive.')

  return await loadProjectSource({ kind: 'archive-file', displayName: file.name, file }, onProgress)
}

export async function openProjectArchiveFromNativePicker(
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<OpenedProject | null> {
  const handle = await pickProjectArchiveHandle()
  if (!handle) return null
  return await loadProjectSource({ kind: 'archive-handle', displayName: handle.name, handle }, onProgress)
}

export async function loadProjectSource(
  source: ProjectSourceReference,
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<OpenedProject> {
  let filesystem: ProjectFileSystem
  if (source.kind === 'folder') {
    filesystem = new BrowserProjectFileSystem(source.handle)
  } else {
    const file = source.kind === 'archive-file' ? source.file : await source.handle.getFile()
    if (!file.name.toLowerCase().endsWith('.c3p')) throw new Error('The saved file is not a Construct 3 project archive.')
    filesystem = await createC3pProjectFileSystemFromFile(file)
  }

  return {
    analysis: await loadProject(filesystem, { onProgress }),
    filesystem,
    source: source.kind === 'archive-file' ? null : source,
  }
}

export function searchProjectEntities(analysis: ProjectAnalysis, query: string) {
  return searchEntities(analysis.index, query)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
