import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isArchiveHandlePickerSupported,
  pickProjectArchiveHandle,
} from '../project-directory-picker'

afterEach(() => vi.unstubAllGlobals())

describe('native .c3p picker', () => {
  it('uses Chromium’s native picker with a single .c3p file filter', async () => {
    const handle = { kind: 'file', name: 'Platformer.c3p' } as FileSystemFileHandle
    const showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    vi.stubGlobal('window', { showOpenFilePicker })

    expect(isArchiveHandlePickerSupported()).toBe(true)
    await expect(pickProjectArchiveHandle()).resolves.toBe(handle)
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      multiple: false,
      excludeAcceptAllOption: true,
      types: [{ description: 'Construct 3 project', accept: { 'application/octet-stream': ['.c3p'] } }],
    })
  })

  it('treats cancelling the native picker as no selection', async () => {
    const cancellation = Object.assign(new Error('Picker was cancelled'), { name: 'AbortError' })
    vi.stubGlobal('window', { showOpenFilePicker: vi.fn().mockRejectedValue(cancellation) })

    await expect(pickProjectArchiveHandle()).resolves.toBeNull()
  })

  it('reports native picker support as unavailable without the API', async () => {
    vi.stubGlobal('window', undefined)

    expect(isArchiveHandlePickerSupported()).toBe(false)
    await expect(pickProjectArchiveHandle()).rejects.toThrow('Native file picking is unavailable')
  })
})
