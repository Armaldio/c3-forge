<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { ProjectFileSystem } from '../../core/filesystem'
import type { ProjectAnalysis } from '../../core/types'
import { buildProjectResourceItems, isTextResource, RESOURCE_GROUPS, type ProjectResourceItem } from './resource-model'

type PreviewKind = 'image' | 'audio' | 'video' | 'text' | 'metadata'

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
  resourcePath: string | null
}>()

const emit = defineEmits<{
  'select-resource': [path: string]
}>()

const query = ref('')
const selectedId = ref<string | null>(null)
const preview = ref<PreviewState | null>(null)
const imageDimensions = ref<string | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)
let requestId = 0
let previewUrl: string | null = null

const items = computed(() => buildProjectResourceItems(props.analysis))

const filteredItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return items.value
  return items.value.filter((item) => `${item.name} ${item.path} ${item.type} ${item.group}`.toLocaleLowerCase().includes(needle))
})

const visibleGroups = computed(() => RESOURCE_GROUPS.filter((group) => filteredItems.value.some((item) => item.group === group)))
const selectedItem = computed(() => items.value.find((item) => item.navigationPath === selectedId.value) ?? null)

function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const separator = name.lastIndexOf('.')
  return separator >= 0 ? name.slice(separator + 1).toLowerCase() : ''
}

function previewKind(item: ProjectResourceItem): PreviewKind {
  if (item.group === 'Images') return 'image'
  if (item.group === 'Audio') return 'audio'
  if (item.group === 'Videos') return 'video'
  if (item.group === 'Add-ons') return 'text'
  if (isTextResource(item)) return 'text'
  return 'metadata'
}

function contentType(item: ProjectResourceItem, kind: PreviewKind): string {
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

function requestItem(item: ProjectResourceItem): void {
  emit('select-resource', item.navigationPath)
}

watch(() => props.resourcePath, (path) => {
  const item = items.value.find((candidate) => candidate.navigationPath === path)
  selectedId.value = item?.navigationPath ?? null
  imageDimensions.value = null
  failure.value = null
  preview.value = null
  loading.value = false
  revokePreviewUrl()
  if (item) void loadItem(item)
  else requestId += 1
}, { immediate: true })

async function loadItem(item: ProjectResourceItem): Promise<void> {
  const activeRequest = ++requestId
  const kind = previewKind(item)
  if (item.group === 'Add-ons') {
    preview.value = { kind: 'text', text: JSON.stringify(item.metadata ?? {}, null, 2) }
    return
  }
  if (kind === 'metadata') {
    loading.value = true
    try {
      const info = props.filesystem.stat ? await props.filesystem.stat(item.path) : undefined
      if (activeRequest === requestId) {
        preview.value = { kind, size: info?.size, message: 'Preview is not available for this file type.' }
      }
    } catch (error) {
      if (activeRequest === requestId) failure.value = error instanceof Error ? error.message : 'Could not read this project file.'
    } finally {
      if (activeRequest === requestId) loading.value = false
    }
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
    class="resources-view grid h-full min-h-[34rem] w-full min-w-0 grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-[#111a23] text-text max-[760px]:h-auto max-[760px]:grid-cols-1"
    aria-label="Project resources"
  >
    <aside
      class="resource-browser min-w-0 overflow-auto border-r border-line p-4 max-[760px]:max-h-[23rem] max-[760px]:border-r-0 max-[760px]:border-b"
      aria-label="Resource list"
    >
      <div class="resource-list-header flex items-center justify-between gap-4">
        <div>
          <p class="resource-eyebrow m-0 text-[.7rem] font-bold uppercase tracking-[.09em] text-text-muted">
            Global project view
          </p>
          <h2 class="mt-[.2rem] mb-0 text-[1.05rem]">
            Resources
          </h2>
        </div>
        <span class="resource-count text-xs text-text-muted">{{ items.length }}</span>
      </div>
      <label
        class="resource-search-label mt-4 mb-[.35rem] block text-xs text-text-muted"
        for="resource-search"
      >Search resources</label>
      <input
        id="resource-search"
        v-model="query"
        class="resource-search w-full rounded-[.4rem] border border-[#344154] bg-[#192231] px-[.65rem] py-[.55rem] text-[.82rem] text-text focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        type="search"
        placeholder="Name or path"
        autocomplete="off"
      >
      <div
        v-if="visibleGroups.length"
        class="resource-groups mt-5 grid gap-[1.1rem]"
      >
        <section
          v-for="group in visibleGroups"
          :key="group"
          class="resource-group"
          :aria-label="group"
        >
          <h3 class="m-0 mb-[.35rem] flex justify-between text-[.72rem] uppercase tracking-[.07em] text-text-muted">
            {{ group }} <span class="font-medium">{{ filteredItems.filter((item) => item.group === group).length }}</span>
          </h3>
          <ul class="m-0 grid list-none gap-[.15rem] p-0">
            <li
              v-for="item in filteredItems.filter((resource) => resource.group === group)"
              :key="item.navigationPath"
            >
              <button
                class="resource-row flex w-full cursor-pointer items-center gap-2 rounded-[.4rem] border border-transparent bg-transparent p-2 text-left text-inherit hover:bg-[#192231] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                :class="{ 'is-selected border-accent bg-[#1d3048]': selectedId === item.navigationPath }"
                type="button"
                :aria-pressed="selectedId === item.navigationPath"
                @click="requestItem(item)"
              >
                <span class="resource-row-copy grid min-w-0 flex-1 gap-[.15rem]"><strong class="truncate text-[.8rem] font-semibold">{{ item.name }}</strong><small class="truncate text-[.68rem] text-text-muted">{{ item.path }}</small></span>
                <span class="resource-type shrink-0 text-[.68rem] text-text-muted">{{ item.type }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <p
        v-else
        class="resource-empty mt-[1.2rem] text-[.82rem] text-text-muted"
        role="status"
      >
        {{ query ? 'No resources match this search.' : 'No project resources found.' }}
      </p>
    </aside>

    <section
      class="resource-preview min-w-0 overflow-auto p-5 max-[760px]:min-h-[18rem]"
      aria-label="Resource preview"
      aria-live="polite"
    >
      <template v-if="selectedItem">
        <header class="preview-heading flex items-center justify-between gap-4 border-b border-line pb-[.9rem]">
          <div>
            <p class="resource-eyebrow m-0 text-[.7rem] font-bold uppercase tracking-[.09em] text-text-muted">
              {{ selectedItem.group }}
            </p><h2 class="mt-[.2rem] mb-0 break-words text-[1.05rem]">
              {{ selectedItem.name }}
            </h2>
          </div>
          <span
            v-if="preview?.size !== undefined"
            class="preview-size text-xs text-text-muted"
          >{{ formatSize(preview.size) }}</span>
        </header>
        <dl class="resource-metadata my-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-x-4 gap-y-3">
          <div class="min-w-0">
            <dt class="text-[.68rem] text-text-muted">
              Path
            </dt><dd class="mt-[.2rem] mb-0 break-words text-[.78rem]">
              {{ selectedItem.path }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-[.68rem] text-text-muted">
              Type
            </dt><dd class="mt-[.2rem] mb-0 break-words text-[.78rem]">
              {{ selectedItem.type }}
            </dd>
          </div>
          <div
            v-if="imageDimensions"
            class="min-w-0"
          >
            <dt class="text-[.68rem] text-text-muted">
              Dimensions
            </dt><dd class="mt-[.2rem] mb-0 break-words text-[.78rem]">
              {{ imageDimensions }}
            </dd>
          </div>
        </dl>
        <p
          v-if="loading"
          class="preview-message rounded-[.4rem] bg-[#192231] p-[.85rem] text-[.82rem] text-text-muted"
          role="status"
        >
          Loading preview…
        </p>
        <p
          v-else-if="failure"
          class="preview-error rounded-[.4rem] bg-[#192231] p-[.85rem] text-[.82rem] text-[#ff9c9c]"
          role="alert"
        >
          {{ failure }}
        </p>
        <p
          v-else-if="preview?.message"
          class="preview-message rounded-[.4rem] bg-[#192231] p-[.85rem] text-[.82rem] text-text-muted"
        >
          {{ preview.message }}
        </p>
        <img
          v-else-if="preview?.kind === 'image' && preview.url"
          class="image-preview mx-auto my-4 block max-h-[min(65vh,48rem)] max-w-full bg-[#0b0f16] object-contain"
          :src="preview.url"
          :alt="selectedItem.name"
          @load="updateImageDimensions"
        >
        <audio
          v-else-if="preview?.kind === 'audio' && preview.url"
          class="media-preview mx-auto my-8 block w-[min(100%,48rem)]"
          :src="preview.url"
          controls
          preload="none"
        >Audio preview is not supported by this browser.</audio>
        <video
          v-else-if="preview?.kind === 'video' && preview.url"
          class="media-preview mx-auto my-8 block w-[min(100%,48rem)]"
          :src="preview.url"
          controls
          preload="none"
        >Video preview is not supported by this browser.</video>
        <pre
          v-else-if="preview?.kind === 'text'"
          class="text-preview m-0 max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-[.45rem] border border-line bg-[#192231] p-4 font-mono text-[.78rem] leading-[1.5] text-text"
        >{{ preview.text }}</pre>
      </template>
      <div
        v-else
        class="preview-placeholder grid min-h-[25rem] content-center justify-items-center p-8 text-center text-text-muted"
      >
        <span
          class="text-[2rem] text-accent"
          aria-hidden="true"
        >▧</span><h2 class="mt-[.2rem] mb-0 text-[1.05rem]">
          Select a resource
        </h2><p class="max-w-[23rem] text-[.82rem] leading-[1.5]">
          Choose a file to inspect its metadata and preview supported formats.
        </p>
      </div>
    </section>
  </section>
</template>
