import { describe, expect, it } from 'vitest'
import { createProjectIndex } from '../../../core/project-index'
import { buildGraphModel, graphKindsWithSelection, type GraphEntityKind } from '../graph-model'
import type { ForgeEntity, ProjectAnalysis, ProjectDependency, RelationshipKind } from '../../../core/types'

function entity(kind: ForgeEntity['kind'], name: string): ForgeEntity {
  return {
    id: `${kind}:${name}`,
    kind,
    name,
    sourcePath: `${kind}/${name}.json`,
    metadata: {},
  }
}

function dependency(source: ForgeEntity, target: ForgeEntity, relationship: RelationshipKind): ProjectDependency {
  return {
    id: `${source.id}:${relationship}:${target.id}`,
    sourceEntityId: source.id,
    targetEntityId: target.id,
    relationship,
    occurrenceIds: [`${source.id}-occurrence-1`, `${source.id}-occurrence-2`],
  }
}

function analysis(entities: readonly ForgeEntity[], dependencies: readonly ProjectDependency[]): ProjectAnalysis {
  return {
    manifest: {
      projectFile: 'project.c3proj',
      name: 'Graph fixture',
      resources: [],
      folders: [],
      addons: [],
      metadata: {},
    },
    index: createProjectIndex(entities),
    references: [],
    referencesBySource: new Map(),
    referencesByTarget: new Map(),
    dependencies,
    unresolvedReferences: [],
    unsupportedExpressionCount: 0,
    diagnostics: [],
    stats: {
      totalEntities: entities.length,
      entitiesByKind: {
        object: 0, family: 0, layout: 0, eventSheet: 0, timeline: 0,
        flowchart: 0, function: 0, variable: 0, addon: 0, asset: 0, projectFile: 0,
        layoutLayer: 0, layoutInstance: 0, event: 0, behavior: 0, animation: 0, animationFrame: 0, projectFolder: 0,
      },
      totalReferences: 0,
      totalDependencies: dependencies.length,
      totalUnresolvedReferences: 0,
      unsupportedExpressionCount: 0,
      diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
    },
  }
}

const entityKinds: readonly GraphEntityKind[] = ['eventSheet', 'function', 'object', 'family', 'layout']

describe('relationship graph model', () => {
  it('shows only connected indexed entities and aggregates deterministic dependency occurrences', () => {
    const sheet = entity('eventSheet', 'Game Events')
    const spawn = entity('function', 'Spawn')
    const damage = entity('function', 'Apply Damage')
    const isolated = entity('object', 'Unused')
    const model = buildGraphModel(analysis([sheet, spawn, damage, isolated], [
      dependency(sheet, spawn, 'function-call'),
      dependency(spawn, damage, 'function-call'),
    ]), {
      entityKinds,
      relationships: ['function-call'],
      mode: 'project',
      focusHops: 1,
    })

    expect(model.nodes.map((node) => node.entity.id).sort()).toEqual([
      'eventSheet:Game Events', 'function:Apply Damage', 'function:Spawn',
    ].sort())
    expect(model.edges).toHaveLength(2)
    expect(model.edges[0]?.dependency.occurrenceIds).toHaveLength(2)
    expect(model.nodes.find((node) => node.entity.id === sheet.id)?.outgoing).toBe(1)
    expect(model.nodes.find((node) => node.entity.id === spawn.id)?.incoming).toBe(1)
    expect(model.edges[0]?.routeLane).toBe(0)
  })

  it('enables a selected filtered entity kind in focused graph mode', () => {
    expect(graphKindsWithSelection(entityKinds, 'variable')).toContain('variable')
    expect(graphKindsWithSelection([...entityKinds, 'variable'], 'variable')).toEqual([...entityKinds, 'variable'])
    expect(graphKindsWithSelection(entityKinds, 'projectFile')).toContain('projectFile')
  })

  it('routes same-column dependency edges through separate deterministic lanes', () => {
    const first = entity('function', 'First')
    const second = entity('function', 'Second')
    const third = entity('function', 'Third')
    const fourth = entity('function', 'Fourth')
    const model = buildGraphModel(analysis([first, second, third, fourth], [
      dependency(first, second, 'function-call'),
      dependency(third, fourth, 'function-call'),
    ]), {
      entityKinds: ['function'],
      relationships: ['function-call'],
      mode: 'project',
      focusHops: 1,
    })

    expect(model.edges).toHaveLength(2)
    expect(new Set(model.edges.map((edge) => edge.routeLane)).size).toBe(2)
  })

  it('reserves a measured gutter before the adjacent node column for same-column routes and labels', () => {
    const functions = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet']
      .map((name) => entity('function', name))
    const score = entity('variable', 'Score')
    const sameColumnEdges = [0, 2, 4, 6, 8].map((index) =>
      dependency(functions[index]!, functions[index + 1]!, 'function-call'))
    const model = buildGraphModel(analysis([...functions, score], [
      ...sameColumnEdges,
      dependency(functions[0]!, score, 'event-variable-reference'),
    ]), {
      entityKinds: ['function', 'variable'],
      relationships: ['function-call', 'event-variable-reference'],
      mode: 'project',
      focusHops: 1,
    })
    const functionColumn = model.columns.find((column) => column.rank === 2)
    const variableColumn = model.columns.find((column) => column.rank === 3)
    const sourceX = model.nodes.find((node) => node.entity.id === functions[0]!.id)?.position.x

    expect(model.edges).toHaveLength(6)
    expect(new Set(model.edges.filter((edge) => edge.source.kind === edge.target.kind)
      .map((edge) => edge.routeLane))).toEqual(new Set([0, 1, 2, 3, 4]))
    expect(functionColumn).toBeDefined()
    expect(variableColumn).toBeDefined()
    expect(sourceX).toBe(functionColumn?.x)

    // The 220px label allowance, lane offset, and padding fit before the next column.
    const longestLabelRight = sourceX! + 208 + 48 + 4 * 20 + 220 + 12
    expect(variableColumn!.x).toBeGreaterThanOrEqual(longestLabelRight)
    expect(functionColumn!.gutter).toBeGreaterThan(88)
  })

  it('limits focus mode to the selected one-hop or two-hop neighborhood', () => {
    const sheet = entity('eventSheet', 'Game Events')
    const spawn = entity('function', 'Spawn')
    const damage = entity('function', 'Apply Damage')
    const isolated = entity('object', 'Unused')
    const project = analysis([sheet, spawn, damage, isolated], [
      dependency(sheet, spawn, 'function-call'),
      dependency(spawn, damage, 'function-call'),
    ])
    const options = {
      entityKinds,
      relationships: ['function-call'] as const,
      mode: 'focus' as const,
      focusEntityId: sheet.id,
    }
    const oneHop = buildGraphModel(project, { ...options, focusHops: 1 })
    const twoHops = buildGraphModel(project, { ...options, focusHops: 2 })

    expect(oneHop.nodes.map((node) => node.entity.id).sort()).toEqual([sheet.id, spawn.id].sort())
    expect(oneHop.edges).toHaveLength(1)
    expect(twoHops.nodes.map((node) => node.entity.id).sort()).toEqual([sheet.id, spawn.id, damage.id].sort())
    expect(twoHops.edges).toHaveLength(2)
    expect(twoHops.nodes.some((node) => node.entity.id === isolated.id)).toBe(false)
  })

  it('keeps an isolated selected entity available in focus mode', () => {
    const unused = entity('object', 'Unused')
    const model = buildGraphModel(analysis([unused], []), {
      entityKinds,
      relationships: ['object-reference'],
      mode: 'focus',
      focusEntityId: unused.id,
      focusHops: 1,
    })
    expect(model.nodes.map((node) => node.entity.id)).toEqual([unused.id])
    expect(model.edges).toEqual([])
  })

  it('shows structure edges when their endpoint kinds and relationships are enabled', () => {
    const layout = entity('layout', 'Main')
    const layer = entity('layoutLayer', 'World')
    const instance = entity('layoutInstance', 'Player (1)')
    const player = entity('object', 'Player')
    const asset = entity('asset', 'playeranim-walk-000')
    const frame = entity('animationFrame', 'Walk · 1')
    const folder = entity('projectFolder', 'World')
    const childFolder = entity('projectFolder', 'Caves')
    const project = analysis([layout, layer, instance, player, asset, frame, folder, childFolder], [
      dependency(layout, layer, 'layout-layer'),
      dependency(layer, instance, 'layer-instance'),
      dependency(instance, player, 'layout-instance-type'),
      dependency(frame, asset, 'frame-image'),
      dependency(folder, childFolder, 'folder-child'),
    ])
    const model = buildGraphModel(project, {
      entityKinds: ['layout', 'layoutLayer', 'layoutInstance', 'object', 'animationFrame', 'asset', 'projectFolder'],
      relationships: ['layout-layer', 'layer-instance', 'layout-instance-type', 'frame-image', 'folder-child'],
      mode: 'project',
      focusHops: 1,
    })
    const defaults = buildGraphModel(project, {
      entityKinds,
      relationships: ['layout-layer', 'layer-instance', 'layout-instance-type', 'frame-image', 'folder-child'],
      mode: 'project',
      focusHops: 1,
    })

    expect(model.edges.map((edge) => edge.dependency.relationship).sort()).toEqual([
      'layout-layer', 'layer-instance', 'layout-instance-type', 'frame-image', 'folder-child',
    ].sort())
    expect(model.nodes).toHaveLength(8)
    expect(defaults.edges).toEqual([])
  })
})
