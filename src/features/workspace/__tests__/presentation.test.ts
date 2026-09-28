import { describe, expect, it } from 'vitest'
import { RELATIONSHIP_KINDS, type ProjectDiagnostic } from '../../../core/types'
import {
  chooseRelationshipTab,
  defaultGraphRelationshipKinds,
  referencesByRole,
  RELATIONSHIP_PRESENTATION,
  summarizeProjectDiagnostics,
} from '../presentation'

function diagnostic(severity: ProjectDiagnostic['severity']): ProjectDiagnostic {
  return {
    ruleId: `test-${severity}`,
    severity,
    title: 'Test diagnostic',
    description: 'A test diagnostic',
  }
}

describe('summarizeProjectDiagnostics', () => {
  it('reports a clear state when the project has no diagnostics', () => {
    expect(summarizeProjectDiagnostics([])).toEqual({
      counts: { error: 0, warning: 0, info: 0 },
      total: 0,
      state: 'clear',
      label: 'No issues detected',
    })
  })

  it('uses warning state and plural notes when only warnings and notes exist', () => {
    expect(summarizeProjectDiagnostics([
      diagnostic('warning'),
      diagnostic('warning'),
      diagnostic('info'),
      diagnostic('info'),
      diagnostic('info'),
    ])).toEqual({
      counts: { error: 0, warning: 2, info: 3 },
      total: 5,
      state: 'warning',
      label: '2 warnings · 3 notes',
    })
  })

  it('labels a warning-only project with its warning count', () => {
    expect(summarizeProjectDiagnostics([
      diagnostic('warning'),
      diagnostic('warning'),
    ])).toMatchObject({
      counts: { error: 0, warning: 2, info: 0 },
      total: 2,
      state: 'warning',
      label: '2 warnings',
    })
  })

  it('uses info state when notes are the only diagnostics', () => {
    expect(summarizeProjectDiagnostics([
      diagnostic('info'),
      diagnostic('info'),
      diagnostic('info'),
    ])).toEqual({
      counts: { error: 0, warning: 0, info: 3 },
      total: 3,
      state: 'info',
      label: '3 notes',
    })
  })

  it('prioritizes errors and includes every nonzero severity in the status copy', () => {
    expect(summarizeProjectDiagnostics([
      diagnostic('error'),
      diagnostic('warning'),
      diagnostic('warning'),
      diagnostic('info'),
    ])).toEqual({
      counts: { error: 1, warning: 2, info: 1 },
      total: 4,
      state: 'error',
      label: '1 error · 2 warnings · 1 note',
    })
  })
})

describe('chooseRelationshipTab', () => {
  it('preserves the selected tab while it still has references', () => {
    expect(chooseRelationshipTab('incoming', 12, 4)).toBe('incoming')
    expect(chooseRelationshipTab('outgoing', 12, 4)).toBe('outgoing')
  })

  it('switches to the tab with references when the selected tab is empty', () => {
    expect(chooseRelationshipTab('incoming', 0, 7)).toBe('outgoing')
    expect(chooseRelationshipTab('outgoing', 12, 0)).toBe('incoming')
  })

  it('keeps the selected tab when neither direction has references', () => {
    expect(chooseRelationshipTab('incoming', 0, 0)).toBe('incoming')
    expect(chooseRelationshipTab('outgoing', 0, 0)).toBe('outgoing')
  })
})

describe('relationship presentation metadata', () => {
  it('classifies and labels every supported relationship exactly once', () => {
    expect(Object.keys(RELATIONSHIP_PRESENTATION).sort()).toEqual([...RELATIONSHIP_KINDS].sort())
    for (const relationship of RELATIONSHIP_KINDS) {
      const metadata = RELATIONSHIP_PRESENTATION[relationship]
      expect(metadata.label).not.toBe('')
      expect(metadata.graphLabel).not.toBe('')
      expect(['usage/dependency', 'structure/ownership', 'definition/resource']).toContain(metadata.role)
      expect(typeof metadata.defaultGraphVisible).toBe('boolean')
    }
  })

  it('keeps only usage/dependency occurrences in the Where is this used view', () => {
    const references = [
      { id: 'usage', sourceEntityId: 'sheet', targetEntityId: 'player', relationship: 'object-reference', sourcePath: 'eventSheets/Game.json' },
      { id: 'structure', sourceEntityId: 'family', targetEntityId: 'player', relationship: 'family-member', sourcePath: 'families/Actors.json' },
      { id: 'definition', sourceEntityId: 'event', targetEntityId: 'spawn', relationship: 'event-defines-function', sourcePath: 'eventSheets/Game.json' },
    ] as const

    expect(referencesByRole(references, 'usage/dependency').map((reference) => reference.id)).toEqual(['usage'])
    expect(referencesByRole(references, 'structure/ownership').map((reference) => reference.id)).toEqual(['structure'])
    expect(referencesByRole(references, 'definition/resource').map((reference) => reference.id)).toEqual(['definition'])
  })

  it('selects graph defaults from the same relationship registry', () => {
    expect(defaultGraphRelationshipKinds).toContain('function-call')
    expect(defaultGraphRelationshipKinds).toContain('object-reference')
    expect(defaultGraphRelationshipKinds).not.toContain('event-child')
  })
})
