import {
  FIRST_CLASS_ENTITY_KINDS,
  RELATIONSHIP_KINDS,
  type EntityKind,
  type ForgeEntity,
  type ProjectAnalysis,
  type ProjectDependency,
  type RelationshipKind,
} from '../../core/types'

export type GraphEntityKind = Extract<EntityKind,
  'eventSheet' | 'function' | 'object' | 'family' | 'layout' | 'variable' | 'layoutLayer'
  | 'layoutInstance' | 'event' | 'behavior' | 'animation' | 'animationFrame' | 'asset'
  | 'projectFolder' | 'timeline' | 'flowchart' | 'addon' | 'projectFile'>
export type GraphMode = 'project' | 'focus'

export const graphEntityKinds: readonly GraphEntityKind[] = [
  'eventSheet', 'function', 'object', 'family', 'layout', 'variable',
  'layoutLayer', 'layoutInstance', 'event', 'behavior', 'animation', 'animationFrame', 'asset', 'projectFolder',
  'timeline', 'flowchart', 'addon', 'projectFile',
]

export const graphRelationshipKinds: readonly RelationshipKind[] = RELATIONSHIP_KINDS

export interface GraphPoint {
  readonly x: number
  readonly y: number
}

export interface GraphNode {
  readonly entity: ForgeEntity
  readonly position: GraphPoint
  readonly incoming: number
  readonly outgoing: number
}

export interface GraphColumn {
  readonly rank: number
  readonly x: number
  /** Horizontal space reserved after this node column for same-column routes and labels. */
  readonly gutter: number
}

export interface GraphEdge {
  readonly dependency: ProjectDependency
  readonly source: ForgeEntity
  readonly target: ForgeEntity
  readonly routeLane: number
}

export interface GraphModel {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly columns: readonly GraphColumn[]
  readonly width: number
  readonly height: number
}

export interface GraphModelOptions {
  readonly entityKinds: readonly GraphEntityKind[]
  readonly relationships: readonly RelationshipKind[]
  readonly mode: GraphMode
  readonly focusEntityId?: string
  readonly focusHops: 1 | 2
}

export function graphKindsWithSelection(
  currentKinds: readonly GraphEntityKind[],
  selectedKind: EntityKind | undefined,
): readonly GraphEntityKind[] {
  if (!selectedKind || !graphEntityKinds.includes(selectedKind as GraphEntityKind) || currentKinds.includes(selectedKind as GraphEntityKind)) {
    return currentKinds
  }
  return [...currentKinds, selectedKind as GraphEntityKind]
}

const KIND_RANK: Readonly<Record<GraphEntityKind, number>> = {
  layout: 0,
  family: 0,
  eventSheet: 1,
  object: 1,
  function: 2,
  variable: 3,
  projectFolder: 0,
  layoutLayer: 1,
  layoutInstance: 3,
  event: 3,
  behavior: 2,
  animation: 2,
  animationFrame: 3,
  asset: 4,
  timeline: 0,
  flowchart: 0,
  addon: 4,
  projectFile: 4,
}

const NODE_WIDTH = 208
const NODE_HEIGHT = 70
const COLUMN_GAP = 88
const ROW_GAP = 28
const PADDING = 56
const ROUTE_LABEL_START = 48
const ROUTE_LABEL_MAX_WIDTH = 220
const ROUTE_LABEL_PADDING = 12
const ROUTE_LANE_GAP = 20

export function buildGraphModel(analysis: ProjectAnalysis, options: GraphModelOptions): GraphModel {
  const allowedKinds = new Set(options.entityKinds)
  const allowedRelationships = new Set(options.relationships)
  const eligibleEntities = analysis.index.entities.filter((entity): entity is ForgeEntity & { kind: GraphEntityKind } =>
    allowedKinds.has(entity.kind as GraphEntityKind) && graphEntityKinds.includes(entity.kind as GraphEntityKind));
  const eligibleIds = new Set(eligibleEntities.map((entity) => entity.id))
  let edges = analysis.dependencies.flatMap((dependency) => {
    if (!allowedRelationships.has(dependency.relationship)
      || !eligibleIds.has(dependency.sourceEntityId)
      || !eligibleIds.has(dependency.targetEntityId)) return []
    const source = analysis.index.byId.get(dependency.sourceEntityId)
    const target = analysis.index.byId.get(dependency.targetEntityId)
    return source && target ? [{ dependency, source, target }] : []
  })

  if (options.mode === 'focus' && options.focusEntityId) {
    const distances = new Map<string, number>([[options.focusEntityId, 0]])
    const neighbors = new Map<string, Set<string>>()
    for (const edge of edges) {
      const sourceNeighbors = neighbors.get(edge.source.id) ?? new Set<string>()
      const targetNeighbors = neighbors.get(edge.target.id) ?? new Set<string>()
      sourceNeighbors.add(edge.target.id)
      targetNeighbors.add(edge.source.id)
      neighbors.set(edge.source.id, sourceNeighbors)
      neighbors.set(edge.target.id, targetNeighbors)
    }
    let frontier = [options.focusEntityId]
    for (let hop = 1; hop <= options.focusHops; hop += 1) {
      const next: string[] = []
      for (const nodeId of frontier) {
        for (const neighbor of neighbors.get(nodeId) ?? []) {
          if (!distances.has(neighbor)) {
            distances.set(neighbor, hop)
            next.push(neighbor)
          }
        }
      }
      frontier = next
      if (frontier.length === 0) break
    }
    edges = edges.filter((edge) => {
      const sourceDistance = distances.get(edge.source.id)
      const targetDistance = distances.get(edge.target.id)
      if (sourceDistance === undefined || targetDistance === undefined) return false
      return Math.min(sourceDistance, targetDistance) < options.focusHops
    })
  }

  const connectedIds = new Set(edges.flatMap((edge) => [edge.source.id, edge.target.id]))
  if (options.mode === 'focus' && options.focusEntityId && eligibleIds.has(options.focusEntityId)) {
    connectedIds.add(options.focusEntityId)
  }
  const includedEntities = eligibleEntities.filter((entity) => connectedIds.has(entity.id))
  const lanes = new Map<number, ForgeEntity[]>()
  const ranksById = new Map<string, number>()
  for (const entity of includedEntities) {
    const rank = KIND_RANK[entity.kind as GraphEntityKind]
    ranksById.set(entity.id, rank)
    const lane = lanes.get(rank) ?? []
    lane.push(entity)
    lanes.set(rank, lane)
  }
  for (const lane of lanes.values()) {
    lane.sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath))
  }

  const includedEdges = edges.filter((edge) => ranksById.has(edge.source.id) && ranksById.has(edge.target.id))
    .sort((left, right) => left.source.name.localeCompare(right.source.name)
      || left.target.name.localeCompare(right.target.name)
      || left.dependency.relationship.localeCompare(right.dependency.relationship))
  const sameColumnCounts = new Map<number, number>()
  for (const edge of includedEdges) {
    const sourceRank = ranksById.get(edge.source.id)
    if (sourceRank === undefined || sourceRank !== ranksById.get(edge.target.id)) continue
    sameColumnCounts.set(sourceRank, (sameColumnCounts.get(sourceRank) ?? 0) + 1)
  }

  const columns: GraphColumn[] = []
  let nextColumnX = PADDING
  for (const rank of [...lanes.keys()].sort((left, right) => left - right)) {
    const sameColumnEdges = sameColumnCounts.get(rank) ?? 0
    const gutter = sameColumnEdges > 0
      ? Math.max(
        COLUMN_GAP,
        ROUTE_LABEL_START + (sameColumnEdges - 1) * ROUTE_LANE_GAP
          + ROUTE_LABEL_MAX_WIDTH + ROUTE_LABEL_PADDING,
      )
      : COLUMN_GAP
    columns.push({ rank, x: nextColumnX, gutter })
    nextColumnX += NODE_WIDTH + gutter
  }
  const columnByRank = new Map(columns.map((column) => [column.rank, column]))
  const positions = new Map<string, GraphPoint>()
  for (const [rank, lane] of lanes) {
    const column = columnByRank.get(rank)
    if (!column) continue
    lane.forEach((entity, row) => positions.set(entity.id, {
      x: column.x,
      y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
    }))
  }

  const sameColumnRouteLanes = new Map<number, number>()
  const edgesWithLanes = includedEdges.map((edge) => {
    const sourceRank = ranksById.get(edge.source.id)
    if (sourceRank === undefined || sourceRank !== ranksById.get(edge.target.id)) return { ...edge, routeLane: 0 }
    const routeLane = sameColumnRouteLanes.get(sourceRank) ?? 0
    sameColumnRouteLanes.set(sourceRank, routeLane + 1)
    return { ...edge, routeLane }
  })
  const incomingCounts = new Map<string, number>()
  const outgoingCounts = new Map<string, number>()
  for (const edge of edgesWithLanes) {
    incomingCounts.set(edge.target.id, (incomingCounts.get(edge.target.id) ?? 0) + 1)
    outgoingCounts.set(edge.source.id, (outgoingCounts.get(edge.source.id) ?? 0) + 1)
  }

  const nodes: GraphNode[] = includedEntities.map((entity) => ({
    entity,
    position: positions.get(entity.id) ?? { x: PADDING, y: PADDING },
    incoming: incomingCounts.get(entity.id) ?? 0,
    outgoing: outgoingCounts.get(entity.id) ?? 0,
  }))
  const maxRows = Math.max(1, ...[...lanes.values()].map((lane) => lane.length))
  const lastColumn = columns.at(-1)

  return {
    nodes,
    edges: edgesWithLanes,
    columns,
    width: lastColumn ? lastColumn.x + NODE_WIDTH + lastColumn.gutter + PADDING : PADDING * 2,
    height: PADDING * 2 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP,
  }
}

export function graphFocusEntityId(analysis: ProjectAnalysis, allowedKinds: readonly GraphEntityKind[]): string | undefined {
  const allowed = new Set(allowedKinds)
  const scores = new Map<string, number>()
  for (const dependency of analysis.dependencies) {
    const source = analysis.index.byId.get(dependency.sourceEntityId)
    const target = analysis.index.byId.get(dependency.targetEntityId)
    if (source && allowed.has(source.kind as GraphEntityKind)) scores.set(source.id, (scores.get(source.id) ?? 0) + 1)
    if (target && allowed.has(target.kind as GraphEntityKind)) scores.set(target.id, (scores.get(target.id) ?? 0) + 1)
  }
  return [...scores].sort((left, right) => right[1] - left[1]
    || (analysis.index.byId.get(left[0])?.name ?? '').localeCompare(analysis.index.byId.get(right[0])?.name ?? ''))[0]?.[0]
}

export function firstClassEntityCount(analysis: ProjectAnalysis): number {
  return FIRST_CLASS_ENTITY_KINDS.reduce((total, kind) => total + (analysis.stats.entitiesByKind[kind] ?? 0), 0)
}
