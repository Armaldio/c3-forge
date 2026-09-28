import type { ForgeEntity, ProjectAnalysis } from '../../core/types'

export type ResourceGroup = 'Images' | 'Audio' | 'Fonts' | 'Videos' | 'Scripts' | 'Other files' | 'Add-ons' | 'Project source files'

export interface ProjectResourceItem {
  readonly navigationPath: string
  readonly name: string
  readonly path: string
  readonly group: ResourceGroup
  readonly type: string
  readonly metadata?: ForgeEntity['metadata']
}

export const RESOURCE_GROUPS: readonly ResourceGroup[] = [
  'Images', 'Audio', 'Fonts', 'Videos', 'Scripts', 'Other files', 'Add-ons', 'Project source files',
]

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'avi', 'mkv'])
const fontExtensions = new Set(['ttf', 'otf', 'woff', 'woff2'])
const scriptExtensions = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css'])
const textExtensions = new Set(['txt', 'json', 'xml', 'csv', 'md', 'html', 'yaml', 'yml', 'c3proj'])

export function buildProjectResourceItems(analysis: ProjectAnalysis): readonly ProjectResourceItem[] {
  const resources: ProjectResourceItem[] = (analysis.index.byKind.get('asset') ?? []).map((asset) => {
    const extension = extensionOf(asset.sourcePath)
    const category = String(asset.metadata.category ?? '').toLowerCase()
    const group = category === 'script' || scriptExtensions.has(extension)
      ? 'Scripts'
      : groupForExtension(extension)
    return {
      navigationPath: asset.sourcePath,
      name: basename(asset.sourcePath),
      path: asset.sourcePath,
      group,
      type: String(asset.metadata.type ?? asset.metadata.extension ?? (extension.toUpperCase() || 'File')),
    }
  })

  resources.push({
    navigationPath: 'project.c3proj',
    name: 'project.c3proj',
    path: 'project.c3proj',
    group: 'Project source files',
    type: 'C3 project',
  })

  for (const source of analysis.index.entities.filter((entity) => entity.kind === 'projectFile' && entity.sourcePath.toLowerCase().endsWith('.json'))) {
    if (resources.some((resource) => resource.path === source.sourcePath)) continue
    resources.push({
      navigationPath: source.sourcePath,
      name: basename(source.sourcePath),
      path: source.sourcePath,
      group: 'Project source files',
      type: 'JSON project source',
    })
  }

  for (const addon of analysis.index.byKind.get('addon') ?? []) {
    resources.push({
      navigationPath: `addon:${addon.id}`,
      name: addon.name,
      path: `Add-ons/${addon.name}`,
      group: 'Add-ons',
      type: String(addon.metadata.version ?? addon.metadata.pluginId ?? 'Add-on metadata'),
      metadata: addon.metadata,
    })
  }

  return resources.sort((left, right) => left.path.localeCompare(right.path))
}

export function isTextResource(item: ProjectResourceItem): boolean {
  return item.group === 'Scripts' || textExtensions.has(extensionOf(item.path))
}

function groupForExtension(extension: string): ResourceGroup {
  if (imageExtensions.has(extension)) return 'Images'
  if (audioExtensions.has(extension)) return 'Audio'
  if (videoExtensions.has(extension)) return 'Videos'
  if (fontExtensions.has(extension)) return 'Fonts'
  if (extension === 'json' || extension === 'c3proj') return 'Project source files'
  return 'Other files'
}

function extensionOf(path: string): string {
  const name = basename(path)
  const separator = name.lastIndexOf('.')
  return separator >= 0 ? name.slice(separator + 1).toLowerCase() : ''
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}
