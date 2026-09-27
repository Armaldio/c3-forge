import type {
  DiagnosticSeverity,
  EntityKind,
  JsonValue,
  ProjectDiagnostic,
  ProjectLoadStage,
} from '../../core/types'

export type RelationshipTab = 'incoming' | 'outgoing'

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
