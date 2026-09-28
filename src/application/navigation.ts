export type NavigationEntry =
  | { readonly view: 'project'; readonly entityId: string | null }
  | { readonly view: 'graph'; readonly focusEntityId: string | null }
  | { readonly view: 'resources'; readonly resourcePath: string | null }

export type NavigationView = NavigationEntry['view']

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

export function navigationEntryForView(current: NavigationEntry, view: NavigationView): NavigationEntry {
  if (view === 'project') return { view: 'project', entityId: null }
  if (view === 'resources') return { view: 'resources', resourcePath: null }
  return {
    view: 'graph',
    focusEntityId: current.view === 'graph'
      ? current.focusEntityId
      : current.view === 'project' ? current.entityId : null,
  }
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
  if (left.view !== right.view) return false
  switch (left.view) {
    case 'project':
      return right.view === 'project' && left.entityId === right.entityId
    case 'graph':
      return right.view === 'graph' && left.focusEntityId === right.focusEntityId
    case 'resources':
      return right.view === 'resources' && left.resourcePath === right.resourcePath
  }
}
