import type { EntityKind, JsonValue, ProjectLoadStage } from '../../core/types'

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
