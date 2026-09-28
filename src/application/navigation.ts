export type NavigationView = 'overview' | 'graph' | 'resources'

export interface NavigationEntry {
  readonly view: NavigationView
  readonly selectedEntityId: string | null
  readonly graphFocusEntityId?: string | null
}

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

export function replaceCurrentNavigation(history: NavigationHistory, entry: NavigationEntry): NavigationHistory {
  if (sameEntry(currentNavigationEntry(history), entry)) return history

  const entries = history.entries.slice()
  entries[history.index] = copyEntry(entry)
  return { entries, index: history.index }
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
  return left.view === right.view
    && left.selectedEntityId === right.selectedEntityId
    && (left.graphFocusEntityId ?? null) === (right.graphFocusEntityId ?? null)
}
