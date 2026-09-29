import { describe, expect, it } from 'vitest'
import { navigationHash, parseNavigationHash } from '../navigation-url'

describe('workspace navigation URLs', () => {
  it('uses only the two top-level workspaces and opaque tokens', () => {
    const projectUrl = navigationHash('project', 'opaque-project-route')
    const resourcesUrl = navigationHash('resources', 'opaque-resource-route')

    expect(projectUrl).toBe('#/workspace/project/opaque-project-route')
    expect(resourcesUrl).toBe('#/workspace/resources/opaque-resource-route')
    expect(parseNavigationHash(projectUrl)).toEqual({ workspace: 'project', token: 'opaque-project-route' })
    expect(parseNavigationHash(resourcesUrl)).toEqual({ workspace: 'resources', token: 'opaque-resource-route' })
    for (const url of [projectUrl, resourcesUrl]) {
      expect(url).not.toContain('object:sid')
      expect(url).not.toContain('images/')
      expect(url).not.toContain('Player')
    }
  })

  it('rejects paths that encode entity or resource state', () => {
    expect(parseNavigationHash('#/entity/object:sid:123')).toBeNull()
    expect(parseNavigationHash('#/workspace/graph/object:sid:123')).toBeNull()
    expect(parseNavigationHash('#/workspace/project/object:sid:123')).toBeNull()
    expect(parseNavigationHash('#/workspace/unknown/route-1')).toBeNull()
  })
})
