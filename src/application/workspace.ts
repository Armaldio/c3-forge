import { loadProject, searchEntities } from '../core'
import type { ProjectAnalysis, ProjectLoadStage } from '../core'
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

export function searchProjectEntities(analysis: ProjectAnalysis, query: string) {
  return searchEntities(analysis.index, query)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
