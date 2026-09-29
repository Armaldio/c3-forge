import { describe, expect, it } from 'vitest'
import type { EntityKind, ForgeEntity, ManifestResource, ProjectAnalysis } from '../../../core/types'
import { buildProjectResourceItems, isTextResource } from '../resource-model'

function entity(id: string, kind: EntityKind, sourcePath: string, metadata: ForgeEntity['metadata'] = {}): ForgeEntity {
  return { id, kind, name: id, sourcePath, metadata }
}

function projectAnalysis(resources: readonly ManifestResource[], entities: readonly ForgeEntity[] = []): ProjectAnalysis {
  const byKind = new Map<EntityKind, ForgeEntity[]>()
  for (const item of entities) {
    const group = byKind.get(item.kind) ?? []
    group.push(item)
    byKind.set(item.kind, group)
  }
  return {
    manifest: { resources, addons: [], projectFile: 'project.c3proj' },
    index: { entities, byKind },
  } as unknown as ProjectAnalysis
}

describe('global project resources', () => {
  it('classifies Construct source files from manifest resource kinds, not JSON extensions', () => {
    const resources: ManifestResource[] = [
      { kind: 'object', path: 'objectTypes/Player.json', name: 'Player', metadata: {} },
      { kind: 'layout', path: 'layouts/Main.json', name: 'Main', metadata: {} },
      { kind: 'eventSheet', path: 'eventSheets/Game.json', name: 'Game', metadata: {} },
      { kind: 'timeline', path: 'timelines/Intro.json', name: 'Intro', metadata: {} },
      { kind: 'flowchart', path: 'flowcharts/Route.json', name: 'Route', metadata: {} },
      { kind: 'asset', path: 'files/config.json', name: 'config.json', metadata: {} },
      { kind: 'asset', path: 'files/data.json', name: 'data.json', metadata: {} },
      { kind: 'asset', path: 'files/images/player.png', name: 'player.png', metadata: { category: 'image' } },
      { kind: 'asset', path: 'files/audio/theme.ogg', name: 'theme.ogg', metadata: { category: 'sound' } },
      { kind: 'asset', path: 'scripts/game.js', name: 'game.js', metadata: { category: 'script' } },
      { kind: 'asset', path: 'files/readme.md', name: 'readme.md', metadata: {} },
      { kind: 'asset', path: 'files/fonts/game.woff2', name: 'game.woff2', metadata: { category: 'font' } },
    ]
    const addon = entity('my-addon', 'addon', 'project.c3proj', { version: '1.2.0' })
    const items = buildProjectResourceItems(projectAnalysis(resources, [addon]))

    expect(items.map(({ navigationPath, group }) => [navigationPath, group])).toEqual(expect.arrayContaining([
      ['objectTypes/Player.json', 'Project source files'],
      ['layouts/Main.json', 'Project source files'],
      ['eventSheets/Game.json', 'Project source files'],
      ['timelines/Intro.json', 'Project source files'],
      ['flowcharts/Route.json', 'Project source files'],
      ['files/config.json', 'Other files'],
      ['files/data.json', 'Other files'],
      ['files/images/player.png', 'Images'],
      ['files/audio/theme.ogg', 'Audio'],
      ['scripts/game.js', 'Scripts'],
      ['files/readme.md', 'Other files'],
      ['files/fonts/game.woff2', 'Fonts'],
      ['project.c3proj', 'Project source files'],
      ['addon:my-addon', 'Add-ons'],
    ]))
    expect(items.find((item) => item.navigationPath === 'addon:my-addon')?.path).toBe('Add-ons/my-addon')
  })

  it('keeps supported text previews available across resource categories', () => {
    const items = buildProjectResourceItems(projectAnalysis([
      { kind: 'asset', path: 'scripts/game.js', metadata: { category: 'script' } },
      { kind: 'asset', path: 'files/notes.md', metadata: {} },
      { kind: 'asset', path: 'files/settings.json', metadata: {} },
      { kind: 'asset', path: 'files/archive.bin', metadata: {} },
      { kind: 'eventSheet', path: 'eventSheets/Game.json', metadata: {} },
    ]))

    expect(items.filter(isTextResource).map((item) => item.path)).toEqual(expect.arrayContaining([
      'scripts/game.js', 'files/notes.md', 'files/settings.json', 'project.c3proj', 'eventSheets/Game.json',
    ]))
    expect(items.filter(isTextResource).some((item) => item.path === 'files/archive.bin')).toBe(false)
  })
})
