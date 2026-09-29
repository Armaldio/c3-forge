import { describe, expect, it } from 'vitest'
import {
  backNavigation,
  canBack,
  canForward,
  currentNavigationEntry,
  forwardNavigation,
  initNavigationHistory,
  projectEntryForView,
  projectOverviewEntry,
  pushNavigation,
  resourceWorkspaceEntry,
  type NavigationEntry,
} from '../navigation'

const overview = (): NavigationEntry => projectOverviewEntry()
const details = (entityId: string): NavigationEntry => ({ workspace: 'project', entityId, view: 'details' })
const graph = (entityId: string | null): NavigationEntry => ({ workspace: 'project', entityId, view: 'graph' })
const resources = (resourcePath: string | null): NavigationEntry => ({ workspace: 'resources', resourcePath })

describe('navigation history', () => {
  it('starts at Project Overview', () => {
    const history = initNavigationHistory(overview())

    expect(history).toEqual({ entries: [overview()], index: 0 })
    expect(currentNavigationEntry(history)).toEqual(overview())
    expect(canBack(history)).toBe(false)
    expect(canForward(history)).toBe(false)
  })

  it('navigates Overview → Details → focused Graph → another entity Details', () => {
    let history = initNavigationHistory(overview())
    history = pushNavigation(history, details('object:sid:player'))
    history = pushNavigation(history, projectEntryForView(currentNavigationEntry(history), 'graph'))
    history = pushNavigation(history, details('eventSheet:sid:events'))

    expect(history.entries).toEqual([
      overview(),
      details('object:sid:player'),
      graph('object:sid:player'),
      details('eventSheet:sid:events'),
    ])
    expect(currentNavigationEntry(backNavigation(history))).toEqual(graph('object:sid:player'))
  })

  it('restores the exact Graph context after opening an entity', () => {
    const selectedGraph = graph('object:sid:player')
    const history = pushNavigation(initNavigationHistory(selectedGraph), details('eventSheet:sid:events'))

    expect(currentNavigationEntry(backNavigation(history))).toEqual(selectedGraph)
  })

  it('shows the project architecture graph at the Project root', () => {
    expect(projectEntryForView(overview(), 'graph')).toEqual(graph(null))
    expect(projectEntryForView(resources('images/player.png'), 'graph')).toEqual(graph(null))
  })

  it('keeps a resource selection independent and traversable from the Project state', () => {
    let history = initNavigationHistory(details('object:sid:player'))
    history = pushNavigation(history, resourceWorkspaceEntry())
    history = pushNavigation(history, resources('images/player.png'))
    history = pushNavigation(history, resources('images/background.png'))

    expect(currentNavigationEntry(history)).toEqual(resources('images/background.png'))
    expect(currentNavigationEntry(backNavigation(history))).toEqual(resources('images/player.png'))
    expect(currentNavigationEntry(backNavigation(backNavigation(history)))).toEqual(resources(null))
    expect(currentNavigationEntry(backNavigation(backNavigation(backNavigation(history))))).toEqual(details('object:sid:player'))
    expect(currentNavigationEntry(forwardNavigation(backNavigation(history)))).toEqual(resources('images/background.png'))
    expect('entityId' in currentNavigationEntry(history)).toBe(false)
  })

  it('restores every step in the full Project, Graph, and Resources flow', () => {
    let history = initNavigationHistory(overview())
    history = pushNavigation(history, details('object:sid:player'))
    history = pushNavigation(history, graph('object:sid:player'))
    history = pushNavigation(history, details('eventSheet:sid:events'))
    history = pushNavigation(history, resources(null))
    history = pushNavigation(history, resources('images/player.png'))
    history = pushNavigation(history, resources('images/background.png'))

    expect(history.entries).toEqual([
      overview(),
      details('object:sid:player'),
      graph('object:sid:player'),
      details('eventSheet:sid:events'),
      resources(null),
      resources('images/player.png'),
      resources('images/background.png'),
    ])
    const backwardEntries: NavigationEntry[] = []
    while (canBack(history)) {
      history = backNavigation(history)
      backwardEntries.push(currentNavigationEntry(history))
    }
    expect(backwardEntries).toEqual([
      resources('images/player.png'),
      resources(null),
      details('eventSheet:sid:events'),
      graph('object:sid:player'),
      details('object:sid:player'),
      overview(),
    ])
    while (canForward(history)) history = forwardNavigation(history)
    expect(currentNavigationEntry(history)).toEqual(resources('images/background.png'))
  })

  it('truncates the forward branch when navigating after Back', () => {
    let history = initNavigationHistory(details('object:sid:player'))
    history = pushNavigation(history, details('eventSheet:sid:events'))
    history = pushNavigation(history, resources('images/player.png'))
    history = backNavigation(history)
    history = pushNavigation(history, details('function:sid:spawn'))

    expect(history.entries).toEqual([
      details('object:sid:player'),
      details('eventSheet:sid:events'),
      details('function:sid:spawn'),
    ])
    expect(currentNavigationEntry(history)).toEqual(details('function:sid:spawn'))
    expect(canForward(history)).toBe(false)
  })

  it('does not add identical entries and leaves history boundaries unchanged', () => {
    const entry = details('object:sid:player')
    const initial = initNavigationHistory(entry)
    expect(pushNavigation(initial, { ...entry })).toBe(initial)
    expect(backNavigation(initial)).toBe(initial)
    expect(forwardNavigation(initial)).toBe(initial)
  })
})
