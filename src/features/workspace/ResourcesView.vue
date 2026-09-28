<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { ProjectFileSystem } from '../../core/filesystem'
import type { ForgeEntity, ProjectAnalysis } from '../../core/types'

type ResourceGroup = 'Images' | 'Audio' | 'Fonts' | 'Videos' | 'Project files' | 'Add-ons'
type PreviewKind = 'image' | 'audio' | 'video' | 'text' | 'metadata'

interface ResourceItem {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly group: ResourceGroup
  readonly type: string
  readonly entity?: ForgeEntity
}

interface PreviewState {
  readonly kind: PreviewKind
  readonly url?: string
  readonly text?: string
  readonly message?: string
  readonly size?: number
}

const props = defineProps<{
  analysis: ProjectAnalysis
  filesystem: ProjectFileSystem
  active: boolean
}>()

const groups: readonly ResourceGroup[] = ['Images', 'Audio', 'Fonts', 'Videos', 'Project files', 'Add-ons']
const query = ref('')
const selectedId = ref<string | null>(null)
const preview = ref<PreviewState | null>(null)
const imageDimensions = ref<string | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)
let requestId = 0
let previewUrl: string | null = null

const items = computed<readonly ResourceItem[]>(() => {
  if (!props.active) return []
  const assets = props.analysis.index.byKind.get('asset') ?? []
  const resources: ResourceItem[] = assets.map((entity) => {
    const extension = extensionOf(entity.sourcePath)
    return {
      id: `file:${entity.sourcePath}`,
      name: entity.name || basename(entity.sourcePath),
      path: entity.sourcePath,
      group: groupForExtension(extension),
      type: String(entity.metadata.type ?? entity.metadata.extension ?? (extension.toUpperCase() || 'File')),
      entity,
    }
  })
  resources.push({
    id: 'file:project.c3proj',
    name: 'project.c3proj',
    path: 'project.c3proj',
    group: 'Project files',
    type: 'C3 project',
  })
  for (const addon of props.analysis.index.byKind.get('addon') ?? []) {
    resources.push({
      id: `addon:${addon.id}`,
      name: addon.name,
      path: addon.sourcePath,
      group: 'Add-ons',
      type: String(addon.metadata.version ?? addon.metadata.pluginId ?? 'Add-on'),
      entity: addon,
    })
  }
  return resources
})

const filteredItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return items.value
  return items.value.filter((item) => `${item.name} ${item.path} ${item.type} ${item.group}`.toLocaleLowerCase().includes(needle))
})

const visibleGroups = computed(() => groups.filter((group) => filteredItems.value.some((item) => item.group === group)))
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)

function extensionOf(path: string): string {
  const name = basename(path)
  const separator = name.lastIndexOf('.')
  return separator >= 0 ? name.slice(separator + 1).toLowerCase() : ''
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

function groupForExtension(extension: string): ResourceGroup {
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(extension)) return 'Images'
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'].includes(extension)) return 'Audio'
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv', 'avi', 'mkv'].includes(extension)) return 'Videos'
  if (['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return 'Fonts'
  return 'Project files'
}

function previewKind(item: ResourceItem): PreviewKind {
  if (item.group === 'Images') return 'image'
  if (item.group === 'Audio') return 'audio'
  if (item.group === 'Videos') return 'video'
  if (item.group === 'Project files' && ['txt', 'json', 'xml', 'csv', 'md', 'js', 'ts', 'css', 'html', 'yaml', 'yml', 'c3proj'].includes(extensionOf(item.path))) return 'text'
  return 'metadata'
}

function contentType(item: ResourceItem, kind: PreviewKind): string {
  const extension = extensionOf(item.path)
  if (kind === 'image') return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' } as Record<string, string>)[extension] ?? `image/${extension}`
  if (kind === 'audio') return ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', oga: 'audio/ogg' } as Record<string, string>)[extension] ?? `audio/${extension}`
  if (kind === 'video') return ({ m4v: 'video/mp4', mov: 'video/quicktime', ogv: 'video/ogg' } as Record<string, string>)[extension] ?? `video/${extension}`
  return 'text/plain;charset=utf-8'
}

function formatSize(size?: number): string {
  if (size === undefined) return 'Size unavailable'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function revokePreviewUrl(): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
}

async function selectItem(item: ResourceItem): Promise<void> {
  selectedId.value = item.id
  imageDimensions.value = null
  failure.value = null
  preview.value = null
  loading.value = false
  revokePreviewUrl()
  const activeRequest = ++requestId
  const kind = previewKind(item)
  if (kind === 'metadata') {
    preview.value = { kind, message: item.group === 'Add-ons' ? 'Add-on metadata' : 'Preview is not available for this file type.' }
    return
  }

  loading.value = true
  try {
    const info = props.filesystem.stat ? await props.filesystem.stat(item.path) : undefined
    const size = info?.size
    const maxSize = kind === 'text' ? 512 * 1024 : 64 * 1024 * 1024
    if (size !== undefined && size > maxSize) {
      if (activeRequest === requestId) preview.value = { kind: 'metadata', size, message: `Preview is limited to ${formatSize(maxSize)}. File size: ${formatSize(size)}.` }
      return
    }
    const bytes = await props.filesystem.readBinary(item.path)
    if (activeRequest !== requestId) return
    if (bytes.byteLength > maxSize) {
      preview.value = { kind: 'metadata', size: bytes.byteLength, message: `Preview is limited to ${formatSize(maxSize)}. File size: ${formatSize(bytes.byteLength)}.` }
      return
    }
    if (kind === 'text') {
      preview.value = { kind, text: new TextDecoder().decode(bytes), size: size ?? bytes.byteLength }
    } else {
      const blobBytes = new Uint8Array(bytes.byteLength)
      blobBytes.set(bytes)
      previewUrl = URL.createObjectURL(new Blob([blobBytes.buffer], { type: contentType(item, kind) }))
      preview.value = { kind, url: previewUrl, size: size ?? bytes.byteLength }
    }
  } catch (error) {
    if (activeRequest === requestId) failure.value = error instanceof Error ? error.message : 'Could not read this project file.'
  } finally {
    if (activeRequest === requestId) loading.value = false
  }
}

function updateImageDimensions(event: Event): void {
  const image = event.currentTarget
  if (image instanceof HTMLImageElement) imageDimensions.value = `${image.naturalWidth} × ${image.naturalHeight}`
}

onUnmounted(() => {
  requestId += 1
  revokePreviewUrl()
})
</script>

<template>
  <section
    class="resources-view"
    aria-label="Project resources"
  >
    <aside
      class="resource-browser"
      aria-label="Resource list"
    >
      <div class="resource-list-header">
        <div>
          <p class="resource-eyebrow">
            Project files
          </p>
          <h2>Resources</h2>
        </div>
        <span class="resource-count">{{ items.length }}</span>
      </div>
      <label
        class="resource-search-label"
        for="resource-search"
      >Search resources</label>
      <input
        id="resource-search"
        v-model="query"
        class="resource-search"
        type="search"
        placeholder="Name or path"
        autocomplete="off"
      >
      <div
        v-if="visibleGroups.length"
        class="resource-groups"
      >
        <section
          v-for="group in visibleGroups"
          :key="group"
          class="resource-group"
          :aria-label="group"
        >
          <h3>{{ group }} <span>{{ filteredItems.filter((item) => item.group === group).length }}</span></h3>
          <ul>
            <li
              v-for="item in filteredItems.filter((resource) => resource.group === group)"
              :key="item.id"
            >
              <button
                class="resource-row"
                :class="{ 'is-selected': selectedId === item.id }"
                type="button"
                :aria-pressed="selectedId === item.id"
                @click="selectItem(item)"
              >
                <span class="resource-row-copy"><strong>{{ item.name }}</strong><small>{{ item.path }}</small></span>
                <span class="resource-type">{{ item.type }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <p
        v-else
        class="resource-empty"
        role="status"
      >
        {{ query ? 'No resources match this search.' : 'No project resources found.' }}
      </p>
    </aside>

    <section
      class="resource-preview"
      aria-label="Resource preview"
      aria-live="polite"
    >
      <template v-if="selectedItem">
        <header class="preview-heading">
          <div>
            <p class="resource-eyebrow">
              {{ selectedItem.group }}
            </p><h2>{{ selectedItem.name }}</h2>
          </div>
          <span
            v-if="preview?.size !== undefined"
            class="preview-size"
          >{{ formatSize(preview.size) }}</span>
        </header>
        <dl class="resource-metadata">
          <div><dt>Path</dt><dd>{{ selectedItem.path }}</dd></div>
          <div><dt>Type</dt><dd>{{ selectedItem.type }}</dd></div>
          <div v-if="imageDimensions">
            <dt>Dimensions</dt><dd>{{ imageDimensions }}</dd>
          </div>
        </dl>
        <p
          v-if="loading"
          class="preview-message"
          role="status"
        >
          Loading preview…
        </p>
        <p
          v-else-if="failure"
          class="preview-error"
          role="alert"
        >
          {{ failure }}
        </p>
        <p
          v-else-if="preview?.message"
          class="preview-message"
        >
          {{ preview.message }}
        </p>
        <img
          v-else-if="preview?.kind === 'image' && preview.url"
          class="image-preview"
          :src="preview.url"
          :alt="selectedItem.name"
          @load="updateImageDimensions"
        >
        <audio
          v-else-if="preview?.kind === 'audio' && preview.url"
          class="media-preview"
          :src="preview.url"
          controls
          preload="none"
        >Audio preview is not supported by this browser.</audio>
        <video
          v-else-if="preview?.kind === 'video' && preview.url"
          class="media-preview"
          :src="preview.url"
          controls
          preload="none"
        >Video preview is not supported by this browser.</video>
        <pre
          v-else-if="preview?.kind === 'text'"
          class="text-preview"
        >{{ preview.text }}</pre>
      </template>
      <div
        v-else
        class="preview-placeholder"
      >
        <span aria-hidden="true">▧</span><h2>Select a resource</h2><p>Choose a file to inspect its metadata and preview supported formats.</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.resources-view { display: grid; grid-template-columns: minmax(15rem, 21rem) minmax(0, 1fr); min-height: 34rem; height: 100%; color: var(--text-primary, #e8edf5); background: var(--surface, #111722); border: 1px solid var(--border, #283242); border-radius: .75rem; overflow: hidden; }
.resource-browser { min-width: 0; padding: 1rem; border-right: 1px solid var(--border, #283242); overflow: auto; }
.resource-list-header, .preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.resource-list-header h2, .preview-heading h2, .preview-placeholder h2 { margin: .2rem 0 0; font-size: 1.05rem; }
.resource-eyebrow { margin: 0; color: var(--text-muted, #94a0b2); font-size: .7rem; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.resource-count, .preview-size { color: var(--text-muted, #94a0b2); font-size: .75rem; }
.resource-search-label { display: block; margin: 1rem 0 .35rem; color: var(--text-muted, #aab5c4); font-size: .75rem; }
.resource-search { box-sizing: border-box; width: 100%; padding: .55rem .65rem; color: inherit; background: var(--surface-raised, #192231); border: 1px solid var(--border, #344154); border-radius: .4rem; font: inherit; font-size: .82rem; }
.resource-search:focus-visible, .resource-row:focus-visible { outline: 2px solid var(--accent, #77b7ff); outline-offset: 2px; }
.resource-groups { display: grid; gap: 1.1rem; margin-top: 1.25rem; }
.resource-group h3 { display: flex; justify-content: space-between; margin: 0 0 .35rem; color: var(--text-muted, #9ca9bb); font-size: .72rem; letter-spacing: .07em; text-transform: uppercase; }
.resource-group h3 span { font-weight: 500; }
.resource-group ul { display: grid; gap: .15rem; margin: 0; padding: 0; list-style: none; }
.resource-row { display: flex; width: 100%; align-items: center; gap: .5rem; padding: .5rem; color: inherit; text-align: left; background: transparent; border: 1px solid transparent; border-radius: .4rem; cursor: pointer; }
.resource-row:hover { background: var(--surface-raised, #192231); }
.resource-row.is-selected { background: var(--selection, #1d3048); border-color: var(--accent, #427cb6); }
.resource-row-copy { display: grid; min-width: 0; flex: 1; gap: .15rem; }
.resource-row-copy strong, .resource-row-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-row-copy strong { font-size: .8rem; font-weight: 600; }
.resource-row-copy small, .resource-type { color: var(--text-muted, #929fb1); font-size: .68rem; }
.resource-type { flex-shrink: 0; }
.resource-empty { margin-top: 1.2rem; color: var(--text-muted, #9ca9bb); font-size: .82rem; }
.resource-preview { min-width: 0; padding: 1.25rem; overflow: auto; }
.preview-heading { padding-bottom: .9rem; border-bottom: 1px solid var(--border, #283242); }
.preview-heading h2 { overflow-wrap: anywhere; }
.resource-metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .75rem 1rem; margin: 1rem 0; }
.resource-metadata div { min-width: 0; }
.resource-metadata dt { color: var(--text-muted, #9ca9bb); font-size: .68rem; }
.resource-metadata dd { overflow-wrap: anywhere; margin: .2rem 0 0; font-size: .78rem; }
.image-preview { display: block; max-width: 100%; max-height: min(65vh, 48rem); margin: 1rem auto; object-fit: contain; background: #0b0f16; }
.media-preview { display: block; width: min(100%, 48rem); margin: 2rem auto; }
.text-preview { max-height: 65vh; overflow: auto; margin: 0; padding: 1rem; color: var(--text-primary, #e8edf5); background: var(--surface-raised, #192231); border: 1px solid var(--border, #283242); border-radius: .45rem; font: .78rem/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.preview-message, .preview-error { padding: .85rem; color: var(--text-muted, #9ca9bb); background: var(--surface-raised, #192231); border-radius: .4rem; font-size: .82rem; }
.preview-error { color: var(--danger, #ff9c9c); }
.preview-placeholder { display: grid; min-height: 25rem; align-content: center; justify-items: center; padding: 2rem; color: var(--text-muted, #9ca9bb); text-align: center; }
.preview-placeholder > span { color: var(--accent, #77b7ff); font-size: 2rem; }
.preview-placeholder p { max-width: 23rem; font-size: .82rem; line-height: 1.5; }
@media (max-width: 760px) { .resources-view { grid-template-columns: minmax(0, 1fr); height: auto; } .resource-browser { max-height: 23rem; border-right: 0; border-bottom: 1px solid var(--border, #283242); } .resource-preview { min-height: 18rem; } }
</style>
