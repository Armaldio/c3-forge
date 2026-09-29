export type NavigationEntry =
  | {
      readonly workspace: 'project'
      readonly entityId: string | null
      readonly view: 'details' | 'graph'
    }
  | {
      readonly workspace: 'resources'
      readonly resourcePath: string | null
    }

export type ProjectNavigationView = Extract<NavigationEntry, { workspace: 'project' }>['view']
export type NavigationWorkspace = NavigationEntry['workspace']

export interface NavigationHistory {
  readonly entries: readonly NavigationEntry[]
  readonly index: number
}

export function initNavigationHistory(entry: NavigationEntry): NavigationHistory {
  return { entries: [copyEntry(entry)], index: 0 }
}

export function pushNavigation(history: NavigationHistory, entry: NavigationEntry): NavigationHistory {
  if (sameEntry(currentNavigationEntry(history), entry)) return history

  const entries = history.entries.slice(0, history.index + 1)
  entries.push(copyEntry(entry))
  return { entries, index: entries.length - 1 }
}

export function projectEntryForView(
  current: NavigationEntry,
  view: ProjectNavigationView,
): Extract<NavigationEntry, { workspace: 'project' }> {
  const entityId = current.workspace === 'project' ? current.entityId : null
  return { workspace: 'project', entityId, view }
}

export function projectOverviewEntry(): Extract<NavigationEntry, { workspace: 'project' }> {
  return { workspace: 'project', entityId: null, view: 'details' }
}

export function resourceWorkspaceEntry(): Extract<NavigationEntry, { workspace: 'resources' }> {
  return { workspace: 'resources', resourcePath: null }
}

export function backNavigation(history: NavigationHistory): NavigationHistory {
  return canBack(history) ? { ...history, index: history.index - 1 } : history
}

export function forwardNavigation(history: NavigationHistory): NavigationHistory {
  return canForward(history) ? { ...history, index: history.index + 1 } : history
}

export function canBack(history: NavigationHistory): boolean {
  return history.index > 0
}

export function canForward(history: NavigationHistory): boolean {
  return history.index < history.entries.length - 1
}

export function currentNavigationEntry(history: NavigationHistory): NavigationEntry {
  return history.entries[history.index]!
}

function copyEntry(entry: NavigationEntry): NavigationEntry {
  return { ...entry }
}

function sameEntry(left: NavigationEntry, right: NavigationEntry): boolean {
  if (left.workspace !== right.workspace) return false
  if (left.workspace === 'resources') {
    return right.workspace === 'resources' && left.resourcePath === right.resourcePath
  }
  return right.workspace === 'project'
    && left.entityId === right.entityId
    && left.view === right.view
}
