import { describe, expect, it } from 'vitest'
import { createProjectDiagnostics, createAnalysisStats } from '../diagnostics'
import { createForgeEntity, makeStableEntityId } from '../entities'
import { createProjectIndex } from '../project-index'
import { extractProjectReferences } from '../references'
import { parseEntitySearch, searchEntities } from '../search'
import type { ParsedResource } from '../resources'
import type { EntityKind, ForgeEntity, ManifestResource, ProjectReference } from '../types'

function resource(kind: EntityKind, entity: ForgeEntity, raw: unknown): ParsedResource {
  const descriptor: ManifestResource = { kind, path: entity.sourcePath, metadata: {} }
  return { descriptor, entity, raw }
}

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
    const beforeRename = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 9001 });
    const afterRename = createForgeEntity('object', 'Hero', 'objectTypes/Actors/Hero.json', { sid: 9001 });
    const withoutSid = createForgeEntity('object', 'Player', 'objectTypes/Player.json');

    expect(beforeRename.id).toBe('object:sid:9001');
    expect(afterRename.id).toBe(beforeRename.id);
    expect(withoutSid.id).toBe(makeStableEntityId('object', withoutSid.sourcePath, withoutSid.name));
  });

  it('extracts structural references as semantic and exact-string matches only as low-confidence fallback', () => {
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const enemy = createForgeEntity('object', 'Enemy', 'objectTypes/Enemy.json')
    const family = createForgeEntity('family', 'Actors', 'families/Actors.json')
    const sheet = createForgeEntity('eventSheet', 'Game Events', 'eventSheets/Game Events.json')
    const layout = createForgeEntity('layout', 'Main', 'layouts/Main.json')
    const spawn = createForgeEntity('function', 'Spawn', sheet.sourcePath, { sheetName: sheet.name }, 'fn:1')
    const score = createForgeEntity('variable', 'score', sheet.sourcePath, { scope: 'global', sheetName: sheet.name }, 'var:score')
    const count = createForgeEntity('variable', 'count', sheet.sourcePath, {
      scope: 'function-parameter', functionName: spawn.name, functionId: spawn.id,
    }, 'var:count')
    const playerHealth = createForgeEntity('variable', 'health', player.sourcePath, { scope: 'object', objectName: player.name }, 'var:health')
    const enemyHealth = createForgeEntity('variable', 'health', enemy.sourcePath, { scope: 'object', objectName: enemy.name }, 'var:health')
    const team = createForgeEntity('variable', 'team', family.sourcePath, { scope: 'family', familyName: family.name }, 'var:team')
    const ghost = createForgeEntity('variable', 'ghostVariable', sheet.sourcePath, { scope: 'global', sheetName: sheet.name }, 'var:ghost')
    const localOnly = createForgeEntity('variable', 'localOnly', sheet.sourcePath, { scope: 'local', sheetName: sheet.name }, 'var:local-only')
    const otherSheetScore = createForgeEntity('variable', 'otherSheetLocal', 'eventSheets/Other Events.json', {
      scope: 'local', sheetName: 'Other Events', eventPath: [0, 0], scopePath: [0], scopePosition: 0,
    }, 'var:other-sheet-local')
    const index = createProjectIndex([
      player, enemy, family, sheet, layout, spawn, score, count, playerHealth, enemyHealth, team, ghost, localOnly, otherSheetScore,
    ])
    const resources = [
      resource('family', family, { members: ['Player'] }),
      resource('eventSheet', sheet, {
        events: [
          { eventType: 'include', includeSheet: 'Missing Events' },
          {
            conditions: [{ objectClass: 'Enemy' }],
            actions: [
              { id: 'set-eventvar-value', objectClass: 'System', parameters: { variable: 'score', value: 'score + 1' } },
              { id: 'set-value', objectClass: 'System', parameters: { value: 'localOnly + 1' } },
              { objectClass: 'Text', id: 'set-text', parameters: { text: '"ghostVariable" & Player.health + Actors.team + score' } },
            ],
          },
          {
            eventType: 'function-block',
            functionName: 'Spawn',
            actions: [
              { callFunction: 'Spawn' },
              { id: 'add-to-eventvar', objectClass: 'System', parameters: { variable: 'count', value: 'count + score' } },
            ],
          },
        ],
      }),
      resource('layout', layout, { notes: 'Player' }),
    ]

    const references = extractProjectReferences(resources, index)
    const find = (source: ForgeEntity, relationship: string): ProjectReference | undefined =>
      references.find((reference) => reference.sourceEntityId === source.id && reference.relationship === relationship)

    expect(find(family, 'family-member')).toMatchObject({
      targetEntityId: player.id,
      confidence: 'high',
      source: 'semantic',
    })
    expect(find(sheet, 'event-sheet-include')).toMatchObject({
      targetName: 'Missing Events',
      confidence: 'high',
      source: 'semantic',
    })
    expect(find(sheet, 'event-object-reference')?.targetEntityId).toBe(enemy.id)
    expect(find(spawn, 'function-call')?.targetEntityId).toBe(spawn.id)
    expect(references.some((reference) => reference.relationship === 'exact-string-match'
      && reference.targetEntityId === spawn.id)).toBe(false)
    expect(find(sheet, 'event-variable-action')).toMatchObject({
      targetEntityId: score.id,
      confidence: 'high',
      source: 'semantic',
    })
    expect(find(sheet, 'event-variable-expression')).toMatchObject({
      targetEntityId: score.id,
      confidence: 'medium',
      source: 'construct-expression',
    })
    expect(find(sheet, 'instance-variable-expression')?.targetEntityId).toBe(playerHealth.id)
    expect(find(sheet, 'family-variable-expression')?.targetEntityId).toBe(team.id)
    expect(references.some((reference) => reference.targetEntityId === enemyHealth.id)).toBe(false)
    expect(references.some((reference) => reference.targetEntityId === ghost.id)).toBe(false)
    expect(references.some((reference) => reference.targetEntityId === localOnly.id)).toBe(false)
    expect(references.some((reference) => reference.targetEntityId === otherSheetScore.id)).toBe(false)
    expect(references.some((reference) => reference.sourceEntityId === spawn.id
      && reference.targetEntityId === count.id
      && reference.source === 'construct-expression')).toBe(true)
    expect(find(layout, 'exact-string-match')).toMatchObject({
      targetEntityId: player.id,
      confidence: 'low',
      source: 'exact-string-fallback',
    })
  })

  it('reports resource and unresolved-reference diagnostics with conservative severities', () => {
    const sheet = createForgeEntity('eventSheet', 'Game Events', 'eventSheets/Game Events.json')
    const index = createProjectIndex([sheet])
    const reference: ProjectReference = {
      id: 'missing-include',
      sourceEntityId: sheet.id,
      sourcePath: sheet.sourcePath,
      targetName: 'Missing Events',
      targetKind: 'eventSheet',
      relationship: 'event-sheet-include',
      confidence: 'high',
      source: 'semantic',
    }
    const issues = [
      { path: 'layouts/Broken.json', stage: 'parse', code: 'invalid-json', message: 'Unexpected token.' },
      { path: 'layouts/Missing.json', stage: 'read', code: 'missing-resource', message: 'File not found.' },
    ] as const

    const diagnostics = createProjectDiagnostics(index, [reference], issues)
    const stats = createAnalysisStats(index.entities, [reference], diagnostics)

    expect(diagnostics.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
      ['resource.invalid-json', 'error'],
      ['resource.missing-resource', 'warning'],
      ['reference.unresolved', 'warning'],
    ])
    expect(diagnostics.some((diagnostic) => /unused/i.test(diagnostic.title))).toBe(false)
    expect(stats.diagnosticsBySeverity).toEqual({ error: 1, warning: 2, info: 0 })
  })

  it('reports a semantic reference with several matching targets as ambiguous, not missing', () => {
    const sheet = createForgeEntity('eventSheet', 'Game Events', 'eventSheets/Game Events.json')
    const first = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const second = createForgeEntity('object', 'Player', 'objectTypes/World/Player.json')
    const index = createProjectIndex([sheet, first, second])
    const reference: ProjectReference = {
      id: 'ambiguous-object',
      sourceEntityId: sheet.id,
      sourcePath: sheet.sourcePath,
      targetName: 'Player',
      targetKind: 'object',
      relationship: 'event-object-reference',
      confidence: 'high',
      source: 'semantic',
    }

    const diagnostics = createProjectDiagnostics(index, [reference], [])
    expect(diagnostics.some((diagnostic) => diagnostic.ruleId === 'reference.ambiguous')).toBe(true)
    expect(diagnostics.some((diagnostic) => diagnostic.ruleId === 'reference.unresolved')).toBe(false)
  })

  it('reports conflicting definitions that reuse one stable entity ID', () => {
    const first = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { pluginId: 'sprite', sid: 1 }, 'same-id');
    const conflicting = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { pluginId: 'audio', sid: 1 }, 'same-id');
    const duplicate = createForgeEntity('object', 'Player', 'objectTypes/Player.json', { sid: 1, pluginId: 'sprite' }, 'same-id');
    const index = createProjectIndex([first, conflicting, duplicate]);

    expect(index.entities).toEqual([first]);
    expect(index.identityConflicts).toEqual([{ id: first.id, entities: [first, conflicting] }]);
    expect(createProjectDiagnostics(index, [], [])).toContainEqual(expect.objectContaining({
      ruleId: 'entity.identity-conflict',
      severity: 'error',
      entityId: first.id,
    }));
  });

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
