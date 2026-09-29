import type { NavigationWorkspace } from './navigation'

export interface NavigationRoute {
  readonly workspace: NavigationWorkspace
  readonly token: string
}

export function navigationHash(workspace: NavigationWorkspace, token: string): string {
  return `#/workspace/${workspace}/${encodeURIComponent(token)}`
}

export function parseNavigationHash(hash: string): NavigationRoute | null {
  const match = /^#\/workspace\/(project|resources)\/([A-Za-z0-9_-]+)$/.exec(hash)
  if (!match) return null
  try {
    return { workspace: match[1] as NavigationWorkspace, token: decodeURIComponent(match[2] as string) }
  } catch {
    return null
  }
}
