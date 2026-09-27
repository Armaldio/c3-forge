import { describe, expect, it } from 'vitest'
import { createProjectDiagnostics } from '../diagnostics'
import { createForgeEntity, makeStableEntityId } from '../entities'
import { createProjectIndex } from '../project-index'
import { createProjectDependencies, createReferenceIndexes } from '../references'
import { parseEntitySearch, searchEntities } from '../search'
import type { ProjectReference } from '../types'

describe('Construct domain foundations', () => {
  it('builds stable entity lookup maps by id, kind, name, and source path', () => {
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const enemy = createForgeEntity('object', 'Enemy', 'objectTypes/Enemy.json')
    const index = createProjectIndex([player, enemy])

    expect(index.byId.get(player.id)).toBe(player)
    expect(index.byKind.get('object')).toEqual([player, enemy])
    expect(index.byName.get('player')).toEqual([player])
    expect(index.bySourcePath.get('objectTypes/Enemy.json')).toEqual([enemy])
    expect(makeStableEntityId('object', player.sourcePath, player.name)).toBe(player.id)
  })

  it('uses Construct SIDs as entity identity across renames and paths', () => {
    const beforeRename = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 9001 })
    const afterRename = createForgeEntity('object', 'Hero', 'objectTypes/Actors/Hero.json', { sid: 9001 })
    const withoutSid = createForgeEntity('object', 'Player', 'objectTypes/Player.json')

    expect(beforeRename.id).toBe('object:sid:9001')
    expect(afterRename.id).toBe(beforeRename.id)
    expect(withoutSid.id).toBe(makeStableEntityId('object', withoutSid.sourcePath, withoutSid.name))
  })

  it('indexes individual occurrences and derives one dependency per deterministic edge', () => {
    const source = createForgeEntity('eventSheet', 'Game Events', 'eventSheets/Game Events.json')
    const target = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const references: readonly ProjectReference[] = [0, 1, 2].map((entryIndex) => ({
      id: `occurrence-${entryIndex}`,
      sourceEntityId: source.id,
      targetEntityId: target.id,
      relationship: 'object-reference',
      sourcePath: source.sourcePath,
      sourceLocation: { eventSid: String(100 + entryIndex), entryKind: 'action', entryIndex },
    }))

    const indexes = createReferenceIndexes(references)
    const dependencies = createProjectDependencies(references)
    expect(indexes.referencesBySource.get(source.id)).toEqual(references)
    expect(indexes.referencesByTarget.get(target.id)).toEqual(references)
    expect(dependencies).toEqual([{
      id: `${encodeURIComponent(source.id)}:object-reference:${encodeURIComponent(target.id)}`,
      sourceEntityId: source.id,
      relationship: 'object-reference',
      targetEntityId: target.id,
      occurrenceIds: ['occurrence-0', 'occurrence-1', 'occurrence-2'],
    }])
    expect(dependencies.some((dependency) => dependency.occurrenceIds.length > 1)).toBe(true)
  })

  it('keeps unresolved explicit targets separate from dependency edges', () => {
    const source = createForgeEntity('eventSheet', 'Game Events', 'eventSheets/Game Events.json')
    const index = createProjectIndex([source])
    const unresolved = [{
      id: 'missing-include',
      sourceEntityId: source.id,
      sourcePath: source.sourcePath,
      targetName: 'Missing Events',
      relationship: 'event-sheet-include',
      resolution: 'missing',
      candidateEntityIds: [],
      sourceLocation: { eventSid: '10', jsonPath: '$.events[0].includeSheet' },
    }] as const
    const diagnostics = createProjectDiagnostics(index, unresolved, [])

    expect(createProjectDependencies([])).toEqual([])
    expect(diagnostics).toContainEqual(expect.objectContaining({
      ruleId: 'relationship.missing-target',
      entityId: source.id,
      sourceLocation: unresolved[0].sourceLocation,
    }))
  })

  it('reports conflicting definitions that reuse one stable entity ID', () => {
    const first = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { pluginId: 'sprite', sid: 1 }, 'same-id')
    const conflicting = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { pluginId: 'audio', sid: 1 }, 'same-id')
    const duplicate = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 1, pluginId: 'sprite' }, 'same-id')
    const index = createProjectIndex([first, conflicting, duplicate])

    expect(index.entities).toEqual([first])
    expect(index.identityConflicts).toEqual([{ id: first.id, entities: [first, conflicting] }])
    expect(createProjectDiagnostics(index, [], [])).toContainEqual(expect.objectContaining({
      ruleId: 'entity.identity-conflict',
      severity: 'error',
      entityId: first.id,
    }))
  })

  it('parses structured search filters and searches indexed metadata', () => {
    const eventSheet = createForgeEntity('eventSheet', 'Combat Events', 'eventSheets/Combat Events.json')
    const damage = createForgeEntity('function', 'Apply Damage', eventSheet.sourcePath, { sheetName: eventSheet.name })
    const index = createProjectIndex([eventSheet, damage])

    expect(parseEntitySearch('kind:function sheet:"Combat Events"')).toEqual({
      terms: [],
      kinds: ['function'],
      sheets: ['combat events'],
    })
    expect(searchEntities(index, 'kind:function sheet:"Combat Events" damage')).toEqual([damage])
    expect(searchEntities(index, 'kind:layout damage')).toEqual([])
  })
})
