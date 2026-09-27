import { describe, expect, it } from 'vitest'
import type { ProjectDiagnostic } from '../../../core/types'
import { chooseRelationshipTab, summarizeProjectDiagnostics } from '../presentation'

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
