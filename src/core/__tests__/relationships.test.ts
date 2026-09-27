import { describe, expect, it } from 'vitest'
import { createProjectDiagnostics } from '../diagnostics'
import { createForgeEntity } from '../entities'
import { createProjectIndex } from '../project-index'
import { extractProjectRelationships } from '../references'
import type { ParsedResource } from '../resources'
import { RELATIONSHIP_KINDS, type EntityKind, type ForgeEntity, type ManifestResource, type RelationshipKind } from '../types'

interface RelationshipCase {
  readonly relationship: RelationshipKind
  readonly targetKind: EntityKind
  readonly sourceKind: EntityKind
  readonly makeOwner?: () => ForgeEntity
  readonly makeStructureEntities?: (source: ForgeEntity, targetName: string) => readonly ForgeEntity[]
  readonly makeTarget: (name: string, sid: string) => ForgeEntity
  readonly makeResource: (source: ForgeEntity, targetName: string) => ParsedResource
}

function resource(kind: EntityKind, entity: ForgeEntity, raw: unknown): ParsedResource {
  const descriptor: ManifestResource = { kind, path: entity.sourcePath, metadata: {} }
  return { descriptor, entity, raw }
}

const cases: readonly RelationshipCase[] = [
  {
    relationship: 'family-member',
    sourceKind: 'family',
    targetKind: 'object',
    makeTarget: (name, sid) => createForgeEntity('object', name, `objectTypes/${sid}.json`, { sid }),
    makeResource: (source, target) => resource('family', source, { members: [target] }),
  },
  {
    relationship: 'layout-instance-type',
    sourceKind: 'layout',
    targetKind: 'object',
    makeTarget: (name, sid) => createForgeEntity('object', name, `objectTypes/${sid}.json`, { sid }),
    makeResource: (source, target) => resource('layout', source, {
      layers: [{ instances: [{ type: target }] }],
    }),
    makeStructureEntities: (source, target) => [createForgeEntity('layoutInstance', target, source.sourcePath, {
      ownerEntityId: source.id,
      objectType: target,
      jsonPath: '$.layers[0].instances[0]',
    }, '$.layers[0].instances[0]')],
  },
  {
    relationship: 'layout-event-sheet',
    sourceKind: 'layout',
    targetKind: 'eventSheet',
    makeTarget: (name, sid) => createForgeEntity('eventSheet', name, `eventSheets/${sid}.json`, { sid }),
    makeResource: (source, target) => resource('layout', source, { eventSheet: target }),
  },
  {
    relationship: 'event-sheet-include',
    sourceKind: 'eventSheet',
    targetKind: 'eventSheet',
    makeTarget: (name, sid) => createForgeEntity('eventSheet', name, `eventSheets/${sid}.json`, { sid }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ eventType: 'include', sid: 10, includeSheet: target }],
    }),
  },
  {
    relationship: 'object-reference',
    sourceKind: 'eventSheet',
    targetKind: 'object',
    makeTarget: (name, sid) => createForgeEntity('object', name, `objectTypes/${sid}.json`, { sid }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ sid: 11, conditions: [{ objectClass: target }] }],
    }),
  },
  {
    relationship: 'function-call',
    sourceKind: 'eventSheet',
    targetKind: 'function',
    makeTarget: (name, sid) => createForgeEntity('function', name, 'eventSheets/Game.json', { sid }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ sid: 12, callFunction: target }],
    }),
  },
  {
    relationship: 'event-variable-reference',
    sourceKind: 'eventSheet',
    targetKind: 'variable',
    makeTarget: (name, sid) => createForgeEntity('variable', name, `eventSheets/${sid}.json`, { sid, scope: 'global' }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ sid: 13, actions: [{
        id: 'set-eventvar-value', objectClass: 'System', parameters: { variable: target, value: '1' },
      }] }],
    }),
  },
  {
    relationship: 'instance-variable-reference',
    sourceKind: 'eventSheet',
    targetKind: 'variable',
    makeOwner: () => createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 'player' }),
    makeTarget: (name, sid) => createForgeEntity('variable', name, 'objectTypes/Player.json', { sid, scope: 'object', objectName: 'Player' }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ sid: 14, actions: [{ id: 'set-instancevar-value', objectClass: 'Player', parameters: { 'instance-variable': target } }] }],
    }),
  },
  {
    relationship: 'family-variable-reference',
    sourceKind: 'eventSheet',
    targetKind: 'variable',
    makeOwner: () => createForgeEntity('family', 'Actors', 'families/Actors.json', { sid: 'actors' }),
    makeTarget: (name, sid) => createForgeEntity('variable', name, 'families/Actors.json', { sid, scope: 'family', familyName: 'Actors' }),
    makeResource: (source, target) => resource('eventSheet', source, {
      events: [{ sid: 15, actions: [{ id: 'set-instancevar-value', objectClass: 'Actors', parameters: { 'instance-variable': target } }] }],
    }),
  },
]

const structuralRelationships: readonly RelationshipKind[] = [
  'layout-layer', 'layer-child', 'layer-instance', 'event-sheet-event', 'event-child',
  'event-defines-function', 'behavior-attachment', 'object-animation', 'animation-frame',
  'frame-image', 'folder-resource', 'folder-child',
]

describe('supported relationship coverage', () => {
  it('accounts for each target-resolved and structurally derived relationship kind', () => {
    expect(new Set([...cases.map(({ relationship }) => relationship), ...structuralRelationships]))
      .toEqual(new Set(RELATIONSHIP_KINDS))
  })
})

function extract(testCase: RelationshipCase, targets: readonly ForgeEntity[]) {
  const source = createForgeEntity(testCase.sourceKind, 'Source', `resources/${testCase.sourceKind}.json`, { sid: 'source' })
  const targetName = targets[0]?.name ?? 'MissingTarget'
  const owner = testCase.makeOwner?.()
  const index = createProjectIndex([
    source,
    ...targets,
    ...(owner ? [owner] : []),
    ...(testCase.makeStructureEntities?.(source, targetName) ?? []),
  ])
  const result = extractProjectRelationships(
    [testCase.makeResource(source, targetName)],
    index,
  )
  return { ...result, source, targetName, index }
}

function referenceName(testCase: RelationshipCase, name: string): string {
  if (testCase.relationship === 'instance-variable-reference') return `Player.${name}`
  if (testCase.relationship === 'family-variable-reference') return `Actors.${name}`
  return name
}

describe.each(cases)('$relationship', (testCase) => {
  it('creates an occurrence only for one uniquely resolved target', () => {
    const target = testCase.makeTarget('Target', 'target-1')
    const result = extract(testCase, [target])

    const matches = result.references.filter((reference) => reference.relationship === testCase.relationship)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      ...(testCase.relationship === 'layout-instance-type'
        ? { sourceEntityId: expect.stringContaining('layoutInstance:') }
        : { sourceEntityId: result.source.id }),
      targetEntityId: target.id,
      relationship: testCase.relationship,
    })
    expect(result.unresolvedReferences).toEqual([])
    expect(matches[0]?.id).toBeTruthy()
  })

  it('keeps a missing explicit target out of references and adds a diagnostic', () => {
    const result = extract(testCase, [])
    const diagnostics = createProjectDiagnostics(result.index, result.unresolvedReferences, [])

    expect(result.references.filter((reference) => reference.relationship === testCase.relationship)).toEqual([])
    expect(result.unresolvedReferences).toMatchObject([{
      relationship: testCase.relationship,
      targetName: referenceName(testCase, 'MissingTarget'),
      resolution: 'missing',
    }])
    expect(diagnostics).toMatchObject([{
      ruleId: 'relationship.missing-target',
      sourcePath: result.source.sourcePath,
    }])
  })

  it('keeps an ambiguous explicit target out of references and adds a diagnostic', () => {
    const first = testCase.makeTarget('Target', 'target-1')
    const second = testCase.makeTarget('Target', 'target-2')
    const result = extract(testCase, [first, second])
    const diagnostics = createProjectDiagnostics(result.index, result.unresolvedReferences, [])

    expect(result.references.filter((reference) => reference.relationship === testCase.relationship)).toEqual([])
    expect(result.unresolvedReferences).toMatchObject([{
      relationship: testCase.relationship,
      targetName: referenceName(testCase, 'Target'),
      resolution: 'ambiguous',
      candidateEntityIds: [first.id, second.id],
    }])
    expect(diagnostics).toMatchObject([{
      ruleId: 'relationship.ambiguous-target',
      sourcePath: result.source.sourcePath,
    }])
  })
})

describe('strict expression and text boundaries', () => {
  it('does not make relationships from arbitrary strings or literal entity names', () => {
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const sheet = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const result = extractProjectRelationships([resource('eventSheet', sheet, {
      notes: ['Player'],
      events: [{ actions: [{ id: 'set-text', parameters: {
        text: '"Player"',
        expression: 'Player',
      } }] }],
    })], createProjectIndex([player, sheet]))

    expect(result.references).toEqual([])
    expect(result.unresolvedReferences).toEqual([])
  })

  it('ignores unsupported expression syntax without guessing references', () => {
    const score = createForgeEntity('variable', 'Score', 'eventSheets/Events.json', { sid: 'score', scope: 'global' })
    const sheet = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const result = extractProjectRelationships([resource('eventSheet', sheet, {
      events: [{ actions: [{ id: 'set-value', parameters: { expression: 'Score ?? 1' } }] }],
    })], createProjectIndex([score, sheet]))

    expect(result.references).toEqual([])
    expect(result.unresolvedReferences).toEqual([])
    expect(result.unsupportedExpressionCount).toBe(1)
  })

  it('ignores expressions beyond the supported parser limits safely', () => {
    const score = createForgeEntity('variable', 'Score', 'eventSheets/Events.json', { sid: 'score', scope: 'global' })
    const sheet = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const deeplyNested = `${'('.repeat(300)}Score${')'.repeat(300)}`
    const result = extractProjectRelationships([resource('eventSheet', sheet, {
      events: [{ actions: [{ id: 'set-value', parameters: { expression: deeplyNested } }] }],
    })], createProjectIndex([score, sheet]))

    expect(result.references).toEqual([])
    expect(result.unsupportedExpressionCount).toBe(1)
  })

  it('parses qualified function calls and preserves each occurrence range', () => {
    const source = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const target = createForgeEntity('function', 'AwardCoins', source.sourcePath, { sid: 'award' })
    const result = extractProjectRelationships([resource('eventSheet', source, {
      events: [{ sid: 20, actions: [{ id: 'set-value', parameters: {
        expression: 'Functions.AwardCoins(1) + Functions.AwardCoins(2)',
      } }] }],
    })], createProjectIndex([source, target]))

    const calls = result.references.filter((reference) => reference.relationship === 'function-call')
    expect(calls).toHaveLength(2)
    expect(calls.every((reference) => reference.targetEntityId === target.id)).toBe(true)
    expect(new Set(calls.map((reference) => reference.id)).size).toBe(2)
    expect(calls.map((reference) => reference.sourceLocation?.expressionRange)).toEqual([
      { start: 10, end: 20 },
      { start: 36, end: 46 },
    ])
  })

  it('resolves only declared object and family instance variables in Construct expressions', () => {
    const source = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 'player' })
    const actors = createForgeEntity('family', 'Actors', 'families/Actors.json', { sid: 'actors' })
    const health = createForgeEntity('variable', 'Health', player.sourcePath, { sid: 'health', scope: 'object', objectName: player.name })
    const team = createForgeEntity('variable', 'Team', actors.sourcePath, { sid: 'team', scope: 'family', familyName: actors.name })
    const result = extractProjectRelationships([resource('eventSheet', source, {
      events: [{ sid: 30, actions: [{ id: 'set-value', parameters: {
        expression: 'Player.Health + Actors.Team',
      } }] }],
    })], createProjectIndex([source, player, actors, health, team]))

    expect(result.references.filter((reference) => reference.relationship === 'instance-variable-reference'))
      .toMatchObject([{ targetEntityId: health.id }])
    expect(result.references.filter((reference) => reference.relationship === 'family-variable-reference'))
      .toMatchObject([{ targetEntityId: team.id }])
    expect(result.unresolvedReferences).toEqual([])
  })

  it('resolves an object instance-variable field to a uniquely inherited family variable', () => {
    const source = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 'player' })
    const actors = createForgeEntity('family', 'Actors', 'families/Actors.json', { sid: 'actors' })
    const inheritedHealth = createForgeEntity('variable', 'Health', actors.sourcePath, {
      sid: 'health', scope: 'family', familyName: actors.name,
    })
    const result = extractProjectRelationships([
      resource('eventSheet', source, { events: [{ sid: 31, conditions: [{
        objectClass: 'Player', parameters: { 'instance-variable': 'Health' },
      }] }] }),
      resource('family', actors, { members: ['Player'] }),
    ], createProjectIndex([source, player, actors, inheritedHealth]))

    expect(result.references).toContainEqual(expect.objectContaining({
      targetEntityId: inheritedHealth.id,
      relationship: 'family-variable-reference',
    }))
    expect(result.unresolvedReferences).toEqual([])
  })

  it('resolves Self variables only when the serialized objectClass provides an owner', () => {
    const source = createForgeEntity('eventSheet', 'Events', 'eventSheets/Events.json')
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 'player' })
    const actors = createForgeEntity('family', 'Actors', 'families/Actors.json', { sid: 'actors' })
    const health = createForgeEntity('variable', 'Health', player.sourcePath, {
      sid: 'health', scope: 'object', objectName: player.name,
    })
    const team = createForgeEntity('variable', 'Team', actors.sourcePath, {
      sid: 'team', scope: 'family', familyName: actors.name,
    })
    const result = extractProjectRelationships([
      resource('eventSheet', source, { events: [{ sid: 32, actions: [
        { id: 'set-value', objectClass: 'Player', parameters: { expression: 'Self.Health + Self.Team' } },
        { id: 'set-value', parameters: { expression: 'Self.Health' } },
      ] }] }),
      resource('family', actors, { members: ['Player'] }),
    ], createProjectIndex([source, player, actors, health, team]))

    expect(result.references).toContainEqual(expect.objectContaining({
      targetEntityId: health.id,
      relationship: 'instance-variable-reference',
    }))
    expect(result.references).toContainEqual(expect.objectContaining({
      targetEntityId: team.id,
      relationship: 'family-variable-reference',
    }))
    expect(result.unresolvedReferences).toEqual([])
  })
})
