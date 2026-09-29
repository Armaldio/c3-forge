import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ProjectFileSystem } from '../../../core/filesystem'
import { loadProject } from '../../../core'
import {
  joinProjectPaths,
  normalizeProjectPath,
  resolveProjectPath,
} from '../../../core/paths'
import type { ProjectAnalysis } from '../../../core/types'
import type { NavigationEntry } from '../../../application/navigation'
import ProjectWorkspace from '../ProjectWorkspace.vue'

class MinimalProjectFileSystem implements ProjectFileSystem {
  readonly rootName = 'Composition fixture'
  readonly #files = new Map<string, Uint8Array>([
    ['project.c3proj', new TextEncoder().encode(JSON.stringify({
      name: 'Composition fixture',
      savedWithRelease: 'Construct 3 r999',
      layouts: { items: ['Start'], subfolders: [] },
    }))],
    ['layouts/Start.json', new TextEncoder().encode(JSON.stringify({ name: 'Start', layers: [] }))],
  ])

  async exists(path: string): Promise<boolean> {
    return this.#files.has(this.normalizePath(path))
  }

  async readText(path: string): Promise<string> {
    const file = this.#files.get(this.normalizePath(path))
    if (!file) throw new Error(`Missing fixture file: ${path}`)
    return new TextDecoder().decode(file)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const file = this.#files.get(this.normalizePath(path))
    if (!file) throw new Error(`Missing fixture file: ${path}`)
    return file
  }

  async listFiles(directory = ''): Promise<readonly string[]> {
    return [...this.#files.keys()].filter((path) => parentPath(path) === this.normalizePath(directory))
  }

  async listDirectories(directory = ''): Promise<readonly string[]> {
    const parent = this.normalizePath(directory)
    return [...new Set([...this.#files.keys()].map(parentPath))]
      .filter((path) => path && parentPath(path) === parent)
  }

  normalizePath(path: string): string {
    return normalizeProjectPath(path)
  }

  joinPaths(...segments: readonly string[]): string {
    return joinProjectPaths(...segments)
  }

  resolve(fromPath: string, relativePath: string): string {
    return resolveProjectPath(fromPath, relativePath)
  }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

let analysis: ProjectAnalysis
const filesystem = new MinimalProjectFileSystem()

beforeAll(async () => {
  analysis = await loadProject(filesystem)
})

async function renderWorkspace(navigationEntry: NavigationEntry): Promise<string> {
  return await renderToString(createSSRApp(ProjectWorkspace, {
    analysis,
    filesystem,
    navigationEntry,
    canNavigateBack: false,
    canNavigateForward: false,
    searchQuery: '',
    searchResults: [],
    loading: false,
    loadingStage: null,
    error: null,
    browserSupported: true,
    archivePickerSupported: true,
    restoreChecking: false,
    savedProjectName: null,
    canResumeSavedProject: false,
    persistenceNotice: null,
  }))
}

function indexOfClass(html: string, className: string): number {
  return html.search(new RegExp(`class="[^"]*\\b${className}\\b`))
}

describe('Project workspace composition', () => {
  it('places primary workspace navigation before and outside the Project layout', async () => {
    const html = await renderWorkspace({ workspace: 'project', entityId: null, view: 'details' })
    const navigationStart = indexOfClass(html, 'workspace-navigation')
    const navigationEnd = html.indexOf('</nav>', navigationStart)
    const navigation = html.slice(navigationStart, navigationEnd)
    const projectStart = indexOfClass(html, 'project-workspace-layout')
    const mainStart = indexOfClass(html, 'project-main')

    expect(navigationStart).toBeGreaterThanOrEqual(0)
    expect(navigation).toContain('Project')
    expect(navigation).toContain('Resources')
    expect(navigation).not.toContain('role="tablist"')
    expect(navigation).not.toContain('aria-controls=')
    expect(navigationStart).toBeLessThan(projectStart)
    expect(projectStart).toBeLessThan(mainStart)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Overview')
    expect(html).toContain('Graph')
    expect(html).toMatch(/class="[^"]*\bexplorer-pane\b/)
  })

  it('keeps contextual tabs and the explorer visible for an entity graph', async () => {
    const start = analysis.index.byKind.get('layout')?.[0]
    if (!start) throw new Error('Expected the composition fixture to contain a layout.')
    const html = await renderWorkspace({ workspace: 'project', entityId: start.id, view: 'graph' })
    const tabStart = indexOfClass(html, 'project-context-tabs')
    const tabEnd = html.indexOf('</nav>', tabStart)
    const tabs = html.slice(tabStart, tabEnd)

    expect(tabStart).toBeGreaterThanOrEqual(0)
    expect(tabs).toContain('Details')
    expect(tabs).toContain('Graph')
    expect(html).toMatch(/class="[^"]*\bexplorer-pane\b/)
    expect(html).toMatch(/class="[^"]*\brelationship-graph\b/)
    expect(html).not.toContain('class="workspace-navigation-title"')
  })

  it('binds Explorer disclosure arrows to details and keeps only its heading sticky on mobile', async () => {
    const html = await renderWorkspace({ workspace: 'project', entityId: null, view: 'details' })
    const explorerStart = indexOfClass(html, 'explorer-pane')
    const explorerEnd = html.indexOf('</nav>', explorerStart)
    const explorerHtml = html.slice(explorerStart, explorerEnd)
    const detailsStart = explorerHtml.indexOf('<details class="explorer-group')
    const detailsEnd = explorerHtml.indexOf('</details>', detailsStart)
    const detailsHtml = explorerHtml.slice(detailsStart, detailsEnd)
    const detailsClass = detailsHtml.match(/<details class="([^"]+)"/)?.[1] ?? ''
    const summaryClass = detailsHtml.match(/<summary class="([^"]+)"/)?.[1] ?? ''
    const arrowClass = detailsHtml.match(/<span class="([^"]*group-open:rotate-90[^"]*)"/)?.[1] ?? ''

    expect(detailsClass.split(/\s+/)).toContain('group')
    expect(summaryClass.split(/\s+/)).not.toContain('group')
    expect(arrowClass).toContain('group-open:rotate-90')
    const explorerClass = html.match(/<nav[^>]*class="([^"]*\bexplorer-pane\b[^"]*)"/)?.[1] ?? ''
    const headingClass = explorerHtml.match(/<div[^>]*class="([^"]*\bpane-heading\b[^"]*)"/)?.[1] ?? ''
    expect(explorerClass).not.toContain('max-[760px]:sticky')
    expect(headingClass).toContain('max-[760px]:sticky')
  })

  it('renders Resources as a full-width sibling without Project context', async () => {
    const html = await renderWorkspace({ workspace: 'resources', resourcePath: null })
    const resourcesStart = indexOfClass(html, 'resources-workspace')

    expect(resourcesStart).toBeGreaterThanOrEqual(0)
    expect(html).toMatch(/class="[^"]*\bworkspace-navigation\b/)
    expect(html).toContain('aria-current="page"')
    expect(html.slice(resourcesStart)).toMatch(/class="[^"]*\bresources-view\b/)
    expect(html).not.toMatch(/class="[^"]*\bproject-workspace-layout\b/)
    expect(html).not.toMatch(/class="[^"]*\bexplorer-pane\b/)
    expect(html).not.toMatch(/class="[^"]*\bproject-context-tabs\b/)
    expect(html).not.toMatch(/class="[^"]*\bentity-view\b/)
    expect(html).not.toMatch(/class="[^"]*\bentity-breadcrumb\b/)
    expect(html).not.toContain('class="workspace-navigation-title"')
    expect(html).not.toContain('workspace-panel-resources')
    expect(html).toMatch(/<h2[^>]*>\s*Resources\s*<\/h2>/)
  })

  it('keeps every rendered aria-labelledby target in the document', async () => {
    for (const entry of [
      { workspace: 'project', entityId: null, view: 'details' },
      { workspace: 'project', entityId: analysis.index.byKind.get('layout')?.[0]?.id ?? null, view: 'graph' },
      { workspace: 'resources', resourcePath: null },
    ] satisfies NavigationEntry[]) {
      const html = await renderWorkspace(entry)
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
      const labels = [...html.matchAll(/\baria-labelledby="([^"]+)"/g)]
        .flatMap((match) => match[1]?.split(/\s+/) ?? [])
      const controls = [...html.matchAll(/\baria-controls="([^"]+)"/g)]
        .flatMap((match) => match[1]?.split(/\s+/) ?? [])

      expect(labels.every((id) => ids.has(id))).toBe(true)
      expect(controls.every((id) => ids.has(id))).toBe(true)
    }
  })
})
