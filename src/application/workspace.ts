import { loadProject, searchEntities } from '../core'
import type { ProjectAnalysis, ProjectLoadStage } from '../core'
import type { ProjectFileSystem } from '../core/filesystem'
import { createC3pProjectFileSystemFromFile } from '../infrastructure/browser/c3p-project-file-system'
import { isDirectoryPickerSupported, pickProjectFileSystem } from '../infrastructure/browser/project-directory-picker'

export interface OpenedProject {
  readonly analysis: ProjectAnalysis
  readonly filesystem: ProjectFileSystem
}

export function canOpenProjectFolder(): boolean {
  return isDirectoryPickerSupported()
}

export async function openProjectFolder(
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<OpenedProject | null> {
  try {
    const filesystem = await pickProjectFileSystem()
    return { analysis: await loadProject(filesystem, { onProgress }), filesystem }
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

  const filesystem = await createC3pProjectFileSystemFromFile(file)
  return { analysis: await loadProject(filesystem, { onProgress }), filesystem }
}

export function searchProjectEntities(analysis: ProjectAnalysis, query: string) {
  return searchEntities(analysis.index, query)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
