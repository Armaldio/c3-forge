import { loadProject, searchEntities } from '../core'
import type { ProjectAnalysis, ProjectLoadStage } from '../core'
import { createC3pProjectFileSystemFromFile } from '../infrastructure/browser/c3p-project-file-system'
import { isDirectoryPickerSupported, pickProjectFileSystem } from '../infrastructure/browser/project-directory-picker'

export function canOpenProjectFolder(): boolean {
  return isDirectoryPickerSupported()
}

export async function openProjectFolder(
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<ProjectAnalysis | null> {
  try {
    const filesystem = await pickProjectFileSystem()
    return await loadProject(filesystem, { onProgress })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

export async function openProjectArchive(
  file: File,
  onProgress: (stage: ProjectLoadStage) => void,
): Promise<ProjectAnalysis> {
  if (!file.name.toLowerCase().endsWith('.c3p')) throw new Error('Choose a Construct 3 .c3p project archive.')

  const filesystem = await createC3pProjectFileSystemFromFile(file)
  return await loadProject(filesystem, { onProgress })
}

export function searchProjectEntities(analysis: ProjectAnalysis, query: string) {
  return searchEntities(analysis.index, query)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
