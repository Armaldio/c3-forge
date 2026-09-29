import type { ForgeEntity, ManifestResource, ProjectAnalysis } from '../../core/types'

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
  'Images', 'Audio', 'Fonts', 'Videos', 'Scripts', 'Other files', 'Project source files', 'Add-ons',
]

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'avi', 'mkv'])
const fontExtensions = new Set(['ttf', 'otf', 'woff', 'woff2'])
const scriptExtensions = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css'])
const textExtensions = new Set(['txt', 'json', 'xml', 'csv', 'md', 'html', 'yaml', 'yml', 'c3proj'])

/** Construct source membership comes from the manifest kind, never from a .json suffix. */
export function buildProjectResourceItems(analysis: ProjectAnalysis): readonly ProjectResourceItem[] {
  const resources: ProjectResourceItem[] = analysis.manifest.resources.map((resource) => {
    const extension = extensionOf(resource.path)
    const isConstructSource = resource.kind !== 'asset'
    const group = isConstructSource
      ? 'Project source files'
      : groupForAsset(resource, extension)
    return {
      navigationPath: resource.path,
      name: resource.name || basename(resource.path),
      path: resource.path,
      group,
      type: isConstructSource
        ? `${resource.kind} source`
        : String(resource.metadata.type ?? resource.metadata.extension ?? (extension.toUpperCase() || 'File')),
    }
  })

  if (!resources.some((resource) => resource.path === analysis.manifest.projectFile)) {
    resources.push({
      navigationPath: analysis.manifest.projectFile,
      name: analysis.manifest.projectFile,
      path: analysis.manifest.projectFile,
      group: 'Project source files',
      type: 'C3 project',
    })
  }

  const addons: { id: string; name: string; metadata: ForgeEntity['metadata'] }[] = analysis.manifest.addons.length > 0
    ? analysis.manifest.addons.map((addon) => ({
        id: addon.id,
        name: addon.name,
        metadata: { ...addon.metadata, ...(addon.version ? { version: addon.version } : {}) } as ForgeEntity['metadata'],
      }))
    : (analysis.index.byKind.get('addon') ?? []).map((addon) => ({ id: addon.id, name: addon.name, metadata: addon.metadata }))

  for (const addon of addons) {
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

function groupForAsset(resource: ManifestResource, extension: string): ResourceGroup {
  const category = String(resource.metadata.category ?? '').toLowerCase()
  if (category.includes('script') || scriptExtensions.has(extension)) return 'Scripts'
  if (category.includes('image') || imageExtensions.has(extension)) return 'Images'
  if (category.includes('sound') || category.includes('music') || audioExtensions.has(extension)) return 'Audio'
  if (category.includes('video') || videoExtensions.has(extension)) return 'Videos'
  if (category.includes('font') || fontExtensions.has(extension)) return 'Fonts'
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
