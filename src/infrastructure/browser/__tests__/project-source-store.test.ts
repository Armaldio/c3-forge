import { describe, expect, it, vi } from 'vitest'
import {
  queryProjectSourcePermission,
  requestProjectSourcePermission,
  type ProjectFileSource,
} from '../project-source-store'

function folderSource(queryResult: PermissionState, requestResult: PermissionState = 'granted') {
  const handle = {
    kind: 'directory',
    name: 'Platformer',
    getDirectoryHandle: vi.fn(),
    queryPermission: vi.fn().mockResolvedValue(queryResult),
    requestPermission: vi.fn().mockResolvedValue(requestResult),
  }
  return {
    source: { kind: 'folder', displayName: 'Platformer', handle } as unknown as ProjectFileSource,
    handle,
  }
}

describe('saved project handle permissions', () => {
  it('checks read permission without prompting during reload', async () => {
    const { source, handle } = folderSource('prompt')

    await expect(queryProjectSourcePermission(source)).resolves.toBe('prompt')
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(handle.requestPermission).not.toHaveBeenCalled()
  })

  it('requests read permission only when the user resumes the saved project', async () => {
    const { source, handle } = folderSource('prompt')

    await expect(requestProjectSourcePermission(source)).resolves.toBe('granted')
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  })

  it('keeps a denied read permission denied', async () => {
    const { source, handle } = folderSource('prompt', 'denied')

    await expect(requestProjectSourcePermission(source)).resolves.toBe('denied')
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  })
})
