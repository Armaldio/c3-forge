import { describe, expect, it } from 'vitest'
import { FIRST_CLASS_ENTITY_KINDS, type EntityKind, type ForgeEntity } from '../../../core/types'
import { entityKindPluralLabel } from '../presentation'
import { buildExplorerSections } from '../explorer-model'

function entity(kind: EntityKind, name: string): ForgeEntity {
  return { id: `${kind}:${name}`, kind, name, sourcePath: `${kind}/${name}`, metadata: {} }
}

describe('Explorer sections', () => {
  it('lists each first-class entity kind directly under one counted category', () => {
    const entitiesByKind = new Map<EntityKind, readonly ForgeEntity[]>([
      ['object', [entity('object', 'Player')]],
      ['eventSheet', [entity('eventSheet', 'Game Events')]],
      ['layout', [entity('layout', 'Main')]],
      ['event', [entity('event', 'internal event')]],
    ])

    const sections = buildExplorerSections(entitiesByKind, entityKindPluralLabel)

    expect(sections.map(({ kind, label, entities }) => ({ kind, label, count: entities.length }))).toEqual([
      { kind: 'object', label: 'Objects', count: 1 },
      { kind: 'layout', label: 'Layouts', count: 1 },
      { kind: 'eventSheet', label: 'Event sheets', count: 1 },
    ])
    expect(sections.every((section) => !('kinds' in section))).toBe(true)
    expect(FIRST_CLASS_ENTITY_KINDS).not.toContain('event')
  })
})
