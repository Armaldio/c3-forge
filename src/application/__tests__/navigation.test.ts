import { describe, expect, it } from 'vitest'
import {
  backNavigation,
  canBack,
  canForward,
  currentNavigationEntry,
  forwardNavigation,
  initNavigationHistory,
  navigationEntryForView,
  pushNavigation,
  type NavigationEntry,
} from '../navigation'

const project = (entityId: string | null): NavigationEntry => ({ view: 'project', entityId })
const graph = (focusEntityId: string | null): NavigationEntry => ({ view: 'graph', focusEntityId })
const resources = (resourcePath: string | null): NavigationEntry => ({ view: 'resources', resourcePath })

describe('navigation history', () => {
  it('starts at the Project root and reports no back or forward navigation', () => {
    const history = initNavigationHistory(project(null))

    expect(history).toEqual({ entries: [project(null)], index: 0 })
    expect(currentNavigationEntry(history)).toEqual(project(null))
    expect(canBack(history)).toBe(false)
    expect(canForward(history)).toBe(false)
  })

  it('traverses Project root, entity selections, and views as normal entries', () => {
    const root = project(null)
    const player = project('object:sid:player')
    const events = project('eventSheet:sid:events')
    const graphView = graph('eventSheet:sid:events')
    let history = initNavigationHistory(root)
    history = pushNavigation(history, player)
    history = pushNavigation(history, events)
    history = pushNavigation(history, graphView)

    expect(history.entries).toEqual([root, player, events, graphView])
    expect(currentNavigationEntry(backNavigation(history))).toEqual(events)
    expect(currentNavigationEntry(forwardNavigation(backNavigation(history)))).toEqual(graphView)
  })

  it('records explicit graph focus changes as history entries', () => {
    let history = initNavigationHistory(graph(null))
    history = pushNavigation(history, graph('object:sid:player'))
    history = pushNavigation(history, graph('eventSheet:sid:events'))

    expect(currentNavigationEntry(backNavigation(history))).toEqual(graph('object:sid:player'))
    expect(currentNavigationEntry(forwardNavigation(backNavigation(history)))).toEqual(graph('eventSheet:sid:events'))
  })

  it('returns from opening a graph entity to the previous focused graph entry', () => {
    const focusedGraph = graph('object:sid:player')
    const openedEntity = project('eventSheet:sid:events')
    const history = pushNavigation(initNavigationHistory(focusedGraph), openedEntity)

    expect(currentNavigationEntry(history)).toEqual(openedEntity)
    expect(currentNavigationEntry(backNavigation(history))).toEqual(focusedGraph)
  })

  it('opens each top-level view with only its own state and carries focus into Graph', () => {
    const player = project('object:sid:player')
    expect(navigationEntryForView(player, 'graph')).toEqual(graph('object:sid:player'))
    expect(navigationEntryForView(graph('eventSheet:sid:events'), 'graph')).toEqual(graph('eventSheet:sid:events'))
    expect(navigationEntryForView(resources('images/player.png'), 'graph')).toEqual(graph(null))
    expect(navigationEntryForView(player, 'project')).toEqual(project(null))
    expect(navigationEntryForView(player, 'resources')).toEqual(resources(null))
  })

  it('keeps resource selection in Resources history without carrying the Project entity', () => {
    const player = project('object:sid:player')
    let history = initNavigationHistory(player)
    history = pushNavigation(history, resources(null))
    history = pushNavigation(history, resources('images/player.png'))
    history = pushNavigation(history, resources('images/background.png'))

    expect(currentNavigationEntry(history)).toEqual(resources('images/background.png'))
    expect(currentNavigationEntry(backNavigation(history))).toEqual(resources('images/player.png'))
    expect(currentNavigationEntry(backNavigation(backNavigation(history)))).toEqual(resources(null))
    expect(currentNavigationEntry(backNavigation(backNavigation(backNavigation(history))))).toEqual(player)
    expect(currentNavigationEntry(forwardNavigation(backNavigation(history)))).toEqual(resources('images/background.png'))
    expect('entityId' in currentNavigationEntry(history)).toBe(false)
  })

  it('truncates the forward branch when navigating after Back', () => {
    let history = initNavigationHistory(project('object:sid:player'))
    history = pushNavigation(history, project('eventSheet:sid:events'))
    history = pushNavigation(history, resources('images/player.png'))
    history = backNavigation(history)
    history = pushNavigation(history, project('function:sid:spawn'))

    expect(history.entries).toEqual([
      project('object:sid:player'),
      project('eventSheet:sid:events'),
      project('function:sid:spawn'),
    ])
    expect(currentNavigationEntry(history)).toEqual(project('function:sid:spawn'))
    expect(canForward(history)).toBe(false)
  })

  it('does not add an identical entry for passive navigation', () => {
    const entry = project('object:sid:player')
    const history = initNavigationHistory(entry)

    expect(pushNavigation(history, { ...entry })).toBe(history)
    expect(history.entries).toHaveLength(1)
  })

  it('keeps the current history unchanged at either boundary', () => {
    const initial = initNavigationHistory(project(null))
    expect(backNavigation(initial)).toBe(initial)

    const end = pushNavigation(initial, project('object:sid:player'))
    expect(forwardNavigation(end)).toBe(end)
  })
})
