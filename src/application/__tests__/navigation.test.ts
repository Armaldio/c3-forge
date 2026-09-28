import { describe, expect, it } from 'vitest'
import {
  backNavigation,
  canBack,
  canForward,
  currentNavigationEntry,
  forwardNavigation,
  initNavigationHistory,
  pushNavigation,
  replaceCurrentNavigation,
  type NavigationEntry,
} from '../navigation'

const overview = (selectedEntityId: string | null): NavigationEntry => ({
  view: 'overview',
  selectedEntityId,
})

describe('navigation history', () => {
  it('starts at one entry and reports no back or forward navigation', () => {
    const history = initNavigationHistory(overview('object:sid:player'))

    expect(history).toEqual({ entries: [overview('object:sid:player')], index: 0 })
    expect(currentNavigationEntry(history)).toEqual(overview('object:sid:player'))
    expect(canBack(history)).toBe(false)
    expect(canForward(history)).toBe(false)
  })

  it('pushes entity and view hops and can move back and forward', () => {
    const player = overview('object:sid:player')
    const events = overview('eventSheet:sid:events')
    const graph = {
      view: 'graph',
      selectedEntityId: 'eventSheet:sid:events',
      graphFocusEntityId: 'object:sid:player',
    } satisfies NavigationEntry

    let history = initNavigationHistory(player)
    history = pushNavigation(history, events)
    history = pushNavigation(history, graph)

    expect(history.entries).toEqual([player, events, graph])
    expect(currentNavigationEntry(history)).toEqual(graph)
    expect(canBack(history)).toBe(true)
    expect(canForward(history)).toBe(false)

    history = backNavigation(history)
    expect(currentNavigationEntry(history)).toEqual(events)
    expect(canForward(history)).toBe(true)

    history = forwardNavigation(history)
    expect(currentNavigationEntry(history)).toEqual(graph)
  })

  it('replaces the current entry for graph focus changes', () => {
    const graph = { view: 'graph', selectedEntityId: null } satisfies NavigationEntry
    const focusedGraph = {
      view: 'graph',
      selectedEntityId: null,
      graphFocusEntityId: 'object:sid:player',
    } satisfies NavigationEntry
    const history = replaceCurrentNavigation(initNavigationHistory(graph), focusedGraph)

    expect(history.entries).toEqual([focusedGraph])
    expect(history.index).toBe(0)
    expect(canBack(history)).toBe(false)
  })

  it('truncates the forward branch when navigating after Back', () => {
    const player = overview('object:sid:player')
    const events = overview('eventSheet:sid:events')
    const enemy = overview('object:sid:enemy')
    const resources = { view: 'resources', selectedEntityId: null } satisfies NavigationEntry

    let history = initNavigationHistory(player)
    history = pushNavigation(history, events)
    history = pushNavigation(history, enemy)
    history = backNavigation(history)
    history = pushNavigation(history, resources)

    expect(history.entries).toEqual([player, events, resources])
    expect(currentNavigationEntry(history)).toEqual(resources)
    expect(canForward(history)).toBe(false)
  })

  it('does not add an identical entry for passive navigation', () => {
    const entry = overview('object:sid:player')
    const history = initNavigationHistory(entry)

    expect(pushNavigation(history, { ...entry })).toBe(history)
    expect(history.entries).toHaveLength(1)
  })

  it('keeps the current history unchanged at either boundary', () => {
    const initial = initNavigationHistory(overview(null))
    expect(backNavigation(initial)).toBe(initial)

    const end = pushNavigation(initial, overview('object:sid:player'))
    expect(forwardNavigation(end)).toBe(end)
  })
})
