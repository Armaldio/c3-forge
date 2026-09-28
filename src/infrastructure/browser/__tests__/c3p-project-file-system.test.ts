import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { loadProject } from '../../../core'
import { createC3pProjectFileSystem } from '../c3p-project-file-system'

function archive(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])))
}

function setUnsupportedCompression(bytes: Uint8Array, filename: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let changedLocal = false
  for (let offset = 0; offset + 30 < bytes.length; offset += 1) {
    const signature = view.getUint32(offset, true)
    if (signature === 0x04034b50) {
      const nameLength = view.getUint16(offset + 26, true)
      const nameStart = offset + 30
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
      if (name === filename) {
        view.setUint16(offset + 8, 99, true)
        changedLocal = true
      }
    } else if (signature === 0x02014b50) {
      const nameLength = view.getUint16(offset + 28, true)
      const extraLength = view.getUint16(offset + 30, true)
      const commentLength = view.getUint16(offset + 32, true)
      const nameStart = offset + 46
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
      if (name === filename) {
        view.setUint16(offset + 10, 99, true)
        return
      }
      offset += 45 + nameLength + extraLength + commentLength
    }
  }
  if (!changedLocal) throw new Error(`Could not find local ZIP entry ${filename}`)
  throw new Error(`Could not find central ZIP entry ${filename}`)
}

describe('C3P archive project filesystem', () => {
  it('exposes a project stored at the archive root through the read-only filesystem API', async () => {
    const filesystem = await createC3pProjectFileSystem('game.c3p', archive({
      'project.c3proj': '{"name":"Game"}',
      'eventSheets/Events.json': '{"events":[]}',
      'images/player.png': 'image bytes',
    }))

    expect(filesystem.rootName).toBe('game')
    expect(await filesystem.exists('project.c3proj')).toBe(true)
    expect(await filesystem.readText('eventSheets/Events.json')).toBe('{"events":[]}')
    expect(await filesystem.stat('images/player.png')).toEqual({ size: 'image bytes'.length })
    expect(new TextDecoder().decode(await filesystem.readBinary('images/player.png'))).toBe('image bytes')
    expect(await filesystem.listFiles('eventSheets')).toEqual(['eventSheets/Events.json'])
    expect(await filesystem.listDirectories('')).toEqual(['eventSheets', 'images'])
  })

  it('strips a single wrapper folder around an exported project', async () => {
    const filesystem = await createC3pProjectFileSystem('wrapped.c3p', archive({
      'Construct Project/project.c3proj': '{"name":"Wrapped"}',
      'Construct Project/objectTypes/Player.json': '{"name":"Player"}',
      '__MACOSX/._project.c3proj': 'metadata',
    }))

    expect(await filesystem.exists('project.c3proj')).toBe(true)
    expect(await filesystem.readText('objectTypes/Player.json')).toBe('{"name":"Player"}')
    expect(await filesystem.exists('__MACOSX/._project.c3proj')).toBe(false)
  })

  it('rejects archives without a project manifest', async () => {
    await expect(createC3pProjectFileSystem('not-a-project.c3p', archive({ 'notes.txt': 'no project' })))
      .rejects.toThrow(/project\.c3proj/)
  })

  it('rejects paths that escape the archive root', async () => {
    await expect(createC3pProjectFileSystem('unsafe.c3p', archive({
      'project.c3proj': '{"name":"Unsafe"}',
      '../outside.txt': 'outside',
    }))).rejects.toThrow(/escapes its root/)
  })

  it('loads an archive through the same core loader as folder projects', async () => {
    const filesystem = await createC3pProjectFileSystem('playable.c3p', archive({
      'project.c3proj': JSON.stringify({
        name: 'Playable Archive',
        layouts: { items: ['Start'], subfolders: [] },
      }),
      'layouts/Start.json': JSON.stringify({ name: 'Start', sid: 123, layers: [] }),
    }))
    const analysis = await loadProject(filesystem)

    expect(analysis.manifest.name).toBe('Playable Archive')
    expect(analysis.index.byKind.get('layout')?.map((layout) => layout.name)).toEqual(['Start'])
    expect(analysis.stats.totalReferences).toBe(0)
  })

  it('indexes archive metadata without inflating unselected entries', async () => {
    const bytes = archive({
      'project.c3proj': '{"name":"Lazy"}',
      'images/selected.png': 'selected image bytes',
      'images/broken.png': 'unselected compressed bytes that should stay untouched',
    })
    setUnsupportedCompression(bytes, 'images/broken.png')

    const filesystem = await createC3pProjectFileSystem('lazy.c3p', bytes)
    expect(await filesystem.stat('images/selected.png')).toEqual({ size: 'selected image bytes'.length })
    expect(new TextDecoder().decode(await filesystem.readBinary('images/selected.png'))).toBe('selected image bytes')
    await expect(filesystem.readBinary('images/broken.png')).rejects.toThrow()
  })
})
