import { describe, expect, it } from 'vitest'
import { navigationHash, parseNavigationHash } from '../navigation-url'

describe('workspace navigation URLs', () => {
  it('uses Project as the root route while keeping all selection state opaque', () => {
    const url = navigationHash('project', 'opaque-project-route')

    expect(url).toBe('#/workspace/project/opaque-project-route')
    expect(parseNavigationHash(url)).toEqual({ view: 'project', token: 'opaque-project-route' })
    expect(url).not.toContain('object:sid')
    expect(url).not.toContain('images/')
    expect(url).not.toContain('Player')
  })

  it('encodes only the view and opaque token, never an entity ID or local path', () => {
    const url = navigationHash('graph', 'opaque-route-42')

    expect(url).toBe('#/workspace/graph/opaque-route-42')
    expect(url).not.toContain('object:sid')
    expect(url).not.toContain('Player')
    expect(url).not.toContain('objectTypes')
  })

  it('parses supported view routes and rejects paths carrying project data', () => {
    expect(parseNavigationHash('#/workspace/resources/route-1')).toEqual({ view: 'resources', token: 'route-1' })
    expect(parseNavigationHash('#/entity/object:sid:123')).toBeNull()
    expect(parseNavigationHash('#/workspace/graph/object:sid:123')).toBeNull()
    expect(parseNavigationHash('#/workspace/unknown/route-1')).toBeNull()
  })
})
