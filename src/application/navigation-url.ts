import type { NavigationView } from './navigation'

export interface NavigationRoute {
  readonly view: NavigationView
  readonly token: string
}

export function navigationHash(view: NavigationView, token: string): string {
  return `#/workspace/${view}/${encodeURIComponent(token)}`
}

export function parseNavigationHash(hash: string): NavigationRoute | null {
  const match = /^#\/workspace\/(project|graph|resources)\/([A-Za-z0-9_-]+)$/.exec(hash)
  if (!match) return null
  try {
    return { view: match[1] as NavigationView, token: decodeURIComponent(match[2] as string) }
  } catch {
    return null
  }
}
