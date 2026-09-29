import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import {
  canNavigateBackFromHistoryState,
  canNavigateForwardFromHistoryState,
  forgeNavigationStateFromHistoryState,
  navigationLocationForEntry,
  projectOverviewEntry,
  resourceWorkspaceEntry,
  sameNavigationEntry,
  type NavigationEntry,
} from '../navigation'
import { createForgeRouter } from '../router'

function currentForgeState(router: ReturnType<typeof createForgeRouter>) {
  return forgeNavigationStateFromHistoryState(router.options.history.state)
}

async function pushEntry(
  router: ReturnType<typeof createForgeRouter>,
  entry: NavigationEntry,
  token: string,
  canGoBack = true,
): Promise<void> {
  await router.push(navigationLocationForEntry(entry, token, {
    projectSessionId: 'project-session',
    canGoBack,
  }))
}

async function settleHistoryNavigation(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('Vue Router navigation state', () => {
  it('keeps project and resource data in namespaced history state and URLs opaque', async () => {
    const router = createForgeRouter(createMemoryHistory())
    await pushEntry(router, { workspace: 'project', entityId: 'object:sid:Player-17', view: 'details' }, 'opaque-1')

    expect(router.currentRoute.value.fullPath).toBe('/workspace/project/opaque-1')
    expect(router.currentRoute.value.fullPath).not.toContain('Player')
    expect(router.currentRoute.value.fullPath).not.toContain('sid')
    expect(currentForgeState(router)?.entry).toEqual({
      workspace: 'project', entityId: 'object:sid:Player-17', view: 'details',
    })

    await pushEntry(router, { workspace: 'resources', resourcePath: 'images/player.png' }, 'opaque-2')
    expect(router.currentRoute.value.fullPath).toBe('/workspace/resources/opaque-2')
    expect(router.currentRoute.value.fullPath).not.toContain('images')
    expect(currentForgeState(router)?.entry).toEqual({ workspace: 'resources', resourcePath: 'images/player.png' })
  })

  it('restores project, graph, and resource selections through Back and Forward', async () => {
    const router = createForgeRouter(createMemoryHistory())
    const entries: NavigationEntry[] = [
      projectOverviewEntry(),
      { workspace: 'project', entityId: 'object:sid:Player', view: 'details' },
      { workspace: 'project', entityId: 'object:sid:Player', view: 'graph' },
      { workspace: 'project', entityId: 'event-sheet:sid:GameEvents', view: 'details' },
      resourceWorkspaceEntry(),
      { workspace: 'resources', resourcePath: 'images/player.png' },
      { workspace: 'resources', resourcePath: 'images/background.png' },
    ]

    for (const [index, entry] of entries.entries()) {
      await pushEntry(router, entry, `route-${index}`, index > 0)
    }

    expect(currentForgeState(router)?.entry).toEqual(entries[6])
    expect(canNavigateBackFromHistoryState(router.options.history.state)).toBe(true)

    for (const expected of [...entries.slice(0, 6)].reverse()) {
      router.back()
      await settleHistoryNavigation()
      expect(currentForgeState(router)?.entry).toEqual(expected)
    }
    expect(canNavigateBackFromHistoryState(router.options.history.state)).toBe(false)
    expect(canNavigateForwardFromHistoryState({ forward: '/workspace/resources/next' })).toBe(true)

    for (const expected of entries.slice(1)) {
      router.forward()
      await settleHistoryNavigation()
      expect(currentForgeState(router)?.entry).toEqual(expected)
    }
  })

  it('clears the forward branch when navigation starts after Back', async () => {
    const router = createForgeRouter(createMemoryHistory())
    await pushEntry(router, projectOverviewEntry(), 'root', false)
    await pushEntry(router, { workspace: 'project', entityId: 'object:sid:Player', view: 'details' }, 'player')
    await pushEntry(router, { workspace: 'project', entityId: 'function:sid:SpawnEnemy', view: 'details' }, 'spawn')

    router.back()
    await settleHistoryNavigation()
    await pushEntry(router, { workspace: 'project', entityId: 'event-sheet:sid:Game', view: 'details' }, 'game')

    expect(currentForgeState(router)?.entry).toEqual({
      workspace: 'project', entityId: 'event-sheet:sid:Game', view: 'details',
    })
    router.forward()
    await settleHistoryNavigation()
    expect(currentForgeState(router)?.entry).toEqual({
      workspace: 'project', entityId: 'event-sheet:sid:Game', view: 'details',
    })
  })

  it('honors session back boundaries and compares entries by their selected state', async () => {
    const router = createForgeRouter(createMemoryHistory())
    await pushEntry(router, projectOverviewEntry(), 'root', false)
    expect(canNavigateBackFromHistoryState(router.options.history.state)).toBe(false)
    await pushEntry(router, { workspace: 'project', entityId: 'object:sid:Player', view: 'details' }, 'player')
    expect(canNavigateBackFromHistoryState(router.options.history.state)).toBe(true)
    expect(canNavigateBackFromHistoryState({
      c3ForgeNavigation: { projectSessionId: 'project-session', entry: { workspace: 'project', entityId: null, view: 'details' }, canGoBack: false },
      back: '/before-project',
    })).toBe(false)
    expect(canNavigateBackFromHistoryState({
      c3ForgeNavigation: { projectSessionId: 'project-session', entry: { workspace: 'project', entityId: 'object:sid:Player', view: 'details' }, canGoBack: true },
      back: null,
    })).toBe(false)
    expect(canNavigateBackFromHistoryState({
      c3ForgeNavigation: { projectSessionId: 'project-session', entry: { workspace: 'project', entityId: 'object:sid:Player', view: 'details' }, canGoBack: true },
      back: undefined,
    })).toBe(false)
    expect(canNavigateForwardFromHistoryState({ forward: '/forward-entry' })).toBe(true)
    expect(canNavigateForwardFromHistoryState({ forward: null })).toBe(false)

    expect(sameNavigationEntry(projectOverviewEntry(), projectOverviewEntry())).toBe(true)
    expect(sameNavigationEntry(projectOverviewEntry(), { workspace: 'project', entityId: null, view: 'graph' })).toBe(false)
    expect(sameNavigationEntry(resourceWorkspaceEntry(), { workspace: 'resources', resourcePath: 'images/player.png' })).toBe(false)
  })
})
