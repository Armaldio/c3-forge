import {
  RELATIONSHIP_KINDS,
  type ProjectReference,
  type RelationshipKind,
  type DiagnosticSeverity,
  type EntityKind,
  type JsonValue,
  type ProjectDiagnostic,
  type ProjectLoadStage,
} from '../../core/types'
import type { NavigationEntry } from '../../application/navigation'

export type RelationshipTab = 'incoming' | 'outgoing'
export type RelationshipRole = 'usage/dependency' | 'structure/ownership' | 'definition/resource'

export interface RelationshipPresentationMetadata {
  readonly label: string
  readonly graphLabel: string
  readonly role: RelationshipRole
  readonly defaultGraphVisible: boolean
}

/** The single user-facing classification and label registry for every deterministic relationship. */
export const RELATIONSHIP_PRESENTATION = {
  'family-member': { label: 'Family membership', graphLabel: 'member', role: 'structure/ownership', defaultGraphVisible: true },
  'layout-layer': { label: 'Layout layer', graphLabel: 'layer', role: 'structure/ownership', defaultGraphVisible: false },
  'layer-child': { label: 'Nested layer', graphLabel: 'contains layer', role: 'structure/ownership', defaultGraphVisible: false },
  'layer-instance': { label: 'Layer instance', graphLabel: 'contains instance', role: 'structure/ownership', defaultGraphVisible: false },
  'layout-instance-type': { label: 'Layout instance', graphLabel: 'places', role: 'usage/dependency', defaultGraphVisible: true },
  'layout-event-sheet': { label: 'Event sheet', graphLabel: 'sheet', role: 'usage/dependency', defaultGraphVisible: true },
  'event-sheet-event': { label: 'Event block', graphLabel: 'contains event', role: 'structure/ownership', defaultGraphVisible: false },
  'event-child': { label: 'Nested event', graphLabel: 'nested event', role: 'structure/ownership', defaultGraphVisible: false },
  'event-defines-function': { label: 'Function definition', graphLabel: 'defines', role: 'definition/resource', defaultGraphVisible: false },
  'event-sheet-include': { label: 'Included event sheet', graphLabel: 'includes', role: 'usage/dependency', defaultGraphVisible: true },
  'behavior-attachment': { label: 'Attached behavior', graphLabel: 'has behavior', role: 'structure/ownership', defaultGraphVisible: false },
  'object-animation': { label: 'Animation', graphLabel: 'has animation', role: 'structure/ownership', defaultGraphVisible: false },
  'animation-frame': { label: 'Animation frame', graphLabel: 'has frame', role: 'structure/ownership', defaultGraphVisible: false },
  'frame-image': { label: 'Frame image', graphLabel: 'uses image', role: 'definition/resource', defaultGraphVisible: false },
  'folder-resource': { label: 'Folder content', graphLabel: 'contains', role: 'structure/ownership', defaultGraphVisible: false },
  'folder-child': { label: 'Nested folder', graphLabel: 'contains folder', role: 'structure/ownership', defaultGraphVisible: false },
  'object-reference': { label: 'Object reference', graphLabel: 'uses', role: 'usage/dependency', defaultGraphVisible: true },
  'function-call': { label: 'Function call', graphLabel: 'calls', role: 'usage/dependency', defaultGraphVisible: true },
  'event-variable-reference': { label: 'Event variable', graphLabel: 'uses variable', role: 'usage/dependency', defaultGraphVisible: true },
  'instance-variable-reference': { label: 'Instance variable', graphLabel: 'uses instance variable', role: 'usage/dependency', defaultGraphVisible: true },
  'family-variable-reference': { label: 'Family variable', graphLabel: 'uses family variable', role: 'usage/dependency', defaultGraphVisible: true },
  'behavior-expression-reference': { label: 'Behavior expression', graphLabel: 'uses behavior', role: 'usage/dependency', defaultGraphVisible: true },
} satisfies Record<RelationshipKind, RelationshipPresentationMetadata>

export const defaultGraphRelationshipKinds: readonly RelationshipKind[] = RELATIONSHIP_KINDS
  .filter((relationship) => RELATIONSHIP_PRESENTATION[relationship].defaultGraphVisible)

export function relationshipPresentation(relationship: RelationshipKind): RelationshipPresentationMetadata {
  return RELATIONSHIP_PRESENTATION[relationship]
}

export function referencesByRole(
  references: readonly ProjectReference[],
  role: RelationshipRole,
): readonly ProjectReference[] {
  return references.filter((reference) => RELATIONSHIP_PRESENTATION[reference.relationship].role === role)
}

export function workspaceNavigationTitle(entry: NavigationEntry, entityName?: string): string {
  if (entry.workspace === 'resources') return 'Project resources'
  if (entry.view === 'graph') return entityName ? `${entityName} graph` : 'Relationship graph'
  return entityName ?? 'Project overview'
}

export interface ProjectDiagnosticSummary {
  readonly counts: Readonly<Record<DiagnosticSeverity, number>>
  readonly total: number
  readonly state: 'error' | 'warning' | 'info' | 'clear'
  readonly label: string
}

export const entityKindLabel: Readonly<Record<EntityKind, string>> = {
  object: 'Object',
  family: 'Family',
  layout: 'Layout',
  eventSheet: 'Event sheet',
  timeline: 'Timeline',
  flowchart: 'Flowchart',
  function: 'Function',
  variable: 'Variable',
  addon: 'Add-on',
  asset: 'Asset',
  layoutLayer: 'Layout layer',
  layoutInstance: 'Layout instance',
  event: 'Event block',
  behavior: 'Behavior',
  animation: 'Animation',
  animationFrame: 'Animation frame',
  projectFolder: 'Project folder',
  projectFile: 'Project file',
}

export const entityKindPluralLabel: Readonly<Record<EntityKind, string>> = {
  object: 'Objects',
  family: 'Families',
  layout: 'Layouts',
  eventSheet: 'Event sheets',
  timeline: 'Timelines',
  flowchart: 'Flowcharts',
  function: 'Functions',
  variable: 'Variables',
  addon: 'Add-ons',
  asset: 'Assets',
  layoutLayer: 'Layout layers',
  layoutInstance: 'Layout instances',
  event: 'Event blocks',
  behavior: 'Behaviors',
  animation: 'Animations',
  animationFrame: 'Animation frames',
  projectFolder: 'Project folders',
  projectFile: 'Project files',
}

export const loadStageLabel: Readonly<Record<ProjectLoadStage, string>> = {
  validate: 'Checking the selected folder',
  'read-manifest': 'Reading the project manifest',
  'load-resources': 'Loading project resources',
  parse: 'Parsing Construct files',
  index: 'Building the entity index',
  references: 'Finding entity references',
  diagnostics: 'Checking project health',
  ready: 'Project ready',
}

export function formatMetadataValue(value: JsonValue): string {
  if (typeof value === 'string') return value
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function summarizeProjectDiagnostics(
  diagnostics: readonly ProjectDiagnostic[],
): ProjectDiagnosticSummary {
  const counts: Record<DiagnosticSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1

  const total = counts.error + counts.warning + counts.info
  const state = counts.error > 0 ? 'error'
    : counts.warning > 0 ? 'warning'
      : counts.info > 0 ? 'info' : 'clear'
  const label = [
    counts.error ? `${counts.error} ${counts.error === 1 ? 'error' : 'errors'}` : '',
    counts.warning ? `${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'}` : '',
    counts.info ? `${counts.info} ${counts.info === 1 ? 'note' : 'notes'}` : '',
  ].filter(Boolean).join(' · ') || 'No issues detected'

  return { counts, total, state, label }
}

export function chooseRelationshipTab(
  current: RelationshipTab,
  incomingCount: number,
  outgoingCount: number,
): RelationshipTab {
  const currentCount = current === 'incoming' ? incomingCount : outgoingCount
  const otherCount = current === 'incoming' ? outgoingCount : incomingCount
  if (currentCount > 0 || otherCount === 0) return current
  return current === 'incoming' ? 'outgoing' : 'incoming'
}
