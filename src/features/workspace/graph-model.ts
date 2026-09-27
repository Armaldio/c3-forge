import { RELATIONSHIP_KINDS, type EntityKind, type ForgeEntity, type ProjectAnalysis, type ProjectDependency, type RelationshipKind } from '../../core/types'

export type GraphEntityKind = Extract<EntityKind, 'eventSheet' | 'function' | 'object' | 'family' | 'layout' | 'variable'>
export type GraphMode = 'project' | 'focus'

export const graphEntityKinds: readonly GraphEntityKind[] = [
  'eventSheet', 'function', 'object', 'family', 'layout', 'variable',
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

export interface GraphEdge {
  readonly dependency: ProjectDependency
  readonly source: ForgeEntity
  readonly target: ForgeEntity
}

export interface GraphModel {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
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

const KIND_RANK: Readonly<Record<GraphEntityKind, number>> = {
  layout: 0,
  family: 0,
  eventSheet: 1,
  object: 1,
  function: 2,
  variable: 3,
}

const NODE_WIDTH = 208
const NODE_HEIGHT = 70
const COLUMN_GAP = 88
const ROW_GAP = 28
const PADDING = 56

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
  for (const entity of includedEntities) {
    const rank = KIND_RANK[entity.kind as GraphEntityKind]
    const lane = lanes.get(rank) ?? []
    lane.push(entity)
    lanes.set(rank, lane)
  }
  for (const lane of lanes.values()) {
    lane.sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath))
  }

  const positions = new Map<string, GraphPoint>()
  for (const [rank, lane] of lanes) {
    lane.forEach((entity, row) => positions.set(entity.id, {
      x: PADDING + rank * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
    }))
  }

  const includedEdges = edges.filter((edge) => positions.has(edge.source.id) && positions.has(edge.target.id))
    .sort((left, right) => left.source.name.localeCompare(right.source.name)
      || left.target.name.localeCompare(right.target.name)
      || left.dependency.relationship.localeCompare(right.dependency.relationship))
  const incomingCounts = new Map<string, number>()
  const outgoingCounts = new Map<string, number>()
  for (const edge of includedEdges) {
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
  const maxRank = Math.max(0, ...lanes.keys())

  return {
    nodes,
    edges: includedEdges,
    width: PADDING * 2 + (maxRank + 1) * NODE_WIDTH + maxRank * COLUMN_GAP,
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
