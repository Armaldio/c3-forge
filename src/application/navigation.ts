import type { HistoryState, RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'

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

export const PROJECT_WORKSPACE_ROUTE = 'project-workspace'
export const RESOURCES_WORKSPACE_ROUTE = 'resources-workspace'
export const WORKSPACE_FALLBACK_ROUTE = 'workspace-fallback'
export const FORGE_NAVIGATION_STATE_KEY = 'c3ForgeNavigation'

export interface ForgeNavigationState {
  readonly projectSessionId: string | null
  readonly entry: NavigationEntry
  /** Marks project-session boundaries while Vue Router owns the actual history stack. */
  readonly canGoBack: boolean
}

export interface ForgeNavigationLocationOptions {
  readonly projectSessionId: string | null
  readonly canGoBack: boolean
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

export function sameNavigationEntry(left: NavigationEntry, right: NavigationEntry): boolean {
  if (left.workspace !== right.workspace) return false
  if (left.workspace === 'resources') {
    return right.workspace === 'resources' && left.resourcePath === right.resourcePath
  }
  return right.workspace === 'project'
    && left.entityId === right.entityId
    && left.view === right.view
}

export function isNavigationEntry(value: unknown): value is NavigationEntry {
  if (!isRecord(value)) return false
  if (value.workspace === 'project') {
    return Object.keys(value).every((key) => key === 'workspace' || key === 'entityId' || key === 'view')
      && (value.view === 'details' || value.view === 'graph')
      && (value.entityId === null || typeof value.entityId === 'string')
  }
  if (value.workspace === 'resources') {
    return Object.keys(value).every((key) => key === 'workspace' || key === 'resourcePath')
      && (value.resourcePath === null || typeof value.resourcePath === 'string')
  }
  return false
}

export function forgeNavigationStateFromHistoryState(value: unknown): ForgeNavigationState | null {
  if (!isRecord(value)) return null
  const stored = value[FORGE_NAVIGATION_STATE_KEY]
  if (!isRecord(stored)
    || !(stored.projectSessionId === null || typeof stored.projectSessionId === 'string')
    || typeof stored.canGoBack !== 'boolean'
    || !isNavigationEntry(stored.entry)) return null

  return {
    projectSessionId: stored.projectSessionId,
    entry: stored.entry,
    canGoBack: stored.canGoBack,
  }
}

export function navigationLocationForEntry(
  entry: NavigationEntry,
  token: string,
  options: ForgeNavigationLocationOptions,
): RouteLocationRaw {
  const state: HistoryState = {
    [FORGE_NAVIGATION_STATE_KEY]: {
      projectSessionId: options.projectSessionId,
      entry,
      canGoBack: options.canGoBack,
    },
  }
  const routeName: RouteRecordNameGeneric = entry.workspace === 'project'
    ? PROJECT_WORKSPACE_ROUTE
    : RESOURCES_WORKSPACE_ROUTE

  return { name: routeName, params: { token }, state }
}

export function workspaceForRouteName(name: RouteRecordNameGeneric | undefined): NavigationWorkspace | null {
  if (name === PROJECT_WORKSPACE_ROUTE) return 'project'
  if (name === RESOURCES_WORKSPACE_ROUTE) return 'resources'
  return null
}

export function canNavigateBackFromHistoryState(value: unknown): boolean {
  const state = forgeNavigationStateFromHistoryState(value)
  if (!state?.canGoBack) return false
  if (!isRecord(value) || !Object.hasOwn(value, 'back')) return true
  return value.back !== null && value.back !== undefined
}

export function canNavigateForwardFromHistoryState(value: unknown): boolean {
  return isRecord(value) && value.forward !== null && value.forward !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
