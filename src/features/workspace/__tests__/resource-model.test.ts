import { describe, expect, it } from 'vitest'
import type { EntityKind, ForgeEntity, ProjectAnalysis } from '../../../core/types'
import { buildProjectResourceItems, isTextResource } from '../resource-model'

function entity(id: string, kind: EntityKind, sourcePath: string, metadata: ForgeEntity['metadata'] = {}): ForgeEntity {
  return { id, kind, name: id, sourcePath, metadata }
}

function projectAnalysis(entities: readonly ForgeEntity[]): ProjectAnalysis {
  const byKind = new Map<EntityKind, ForgeEntity[]>()
  for (const item of entities) {
    const group = byKind.get(item.kind) ?? []
    group.push(item)
    byKind.set(item.kind, group)
  }
  return {
    index: { entities, byKind },
  } as unknown as ProjectAnalysis
}

describe('global project resources', () => {
  it('groups files by project-wide resource type without adding semantic entities', () => {
    const objects = entity('Player', 'object', 'objectTypes/Player.json')
    const layout = entity('Main', 'layout', 'layouts/Main.json')
    const assets = [
      entity('sprite', 'asset', 'files/images/player.png', { type: 'image' }),
      entity('theme', 'asset', 'files/audio/theme.ogg'),
      entity('logic', 'asset', 'scripts/game.js', { category: 'script' }),
      entity('source', 'projectFile', 'objectTypes/Player.json'),
      entity('readme', 'asset', 'files/readme.md'),
      entity('settings', 'asset', 'files/config.json'),
      entity('font', 'asset', 'files/fonts/game.woff2'),
    ]
    const addon = entity('my-addon', 'addon', 'project.c3proj', { version: '1.2.0' })
    const items = buildProjectResourceItems(projectAnalysis([objects, layout, ...assets, addon]))

    expect(items.map(({ navigationPath, group }) => [navigationPath, group])).toEqual(expect.arrayContaining([
      ['files/images/player.png', 'Images'],
      ['files/audio/theme.ogg', 'Audio'],
      ['scripts/game.js', 'Scripts'],
      ['files/readme.md', 'Other files'],
      ['files/config.json', 'Project source files'],
      ['files/fonts/game.woff2', 'Fonts'],
      ['project.c3proj', 'Project source files'],
      ['addon:my-addon', 'Add-ons'],
    ]))
    expect(items.find((item) => item.path === 'objectTypes/Player.json')?.group).toBe('Project source files')
    expect(items.find((item) => item.navigationPath === 'addon:my-addon')?.path).toBe('Add-ons/my-addon')
  })

  it('keeps supported text previews available across resource categories', () => {
    const items = buildProjectResourceItems(projectAnalysis([
      entity('script', 'asset', 'scripts/game.js'),
      entity('notes', 'asset', 'files/notes.md'),
      entity('data', 'asset', 'files/settings.json'),
      entity('binary', 'asset', 'files/archive.bin'),
    ]))

    expect(items.filter(isTextResource).map((item) => item.path)).toEqual(expect.arrayContaining([
      'scripts/game.js', 'files/notes.md', 'files/settings.json', 'project.c3proj',
    ]))
    expect(items.filter(isTextResource).some((item) => item.path === 'files/archive.bin')).toBe(false)
  })
})
