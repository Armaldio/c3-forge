<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { ProjectAnalysis, ProjectLoadStage } from './core/types'
import type { ProjectFileSystem } from './core/filesystem'
import ProjectWorkspace from './features/workspace/ProjectWorkspace.vue'
import { buildProjectResourceItems } from './features/workspace/resource-model'
import { canOpenProjectFolder, openProjectArchive, openProjectFolder, searchProjectEntities } from './application/workspace'
import {
  canBack,
  canForward,
  currentNavigationEntry,
  initNavigationHistory,
  navigationEntryForView,
  pushNavigation,
  type NavigationEntry,
  type NavigationHistory,
  type NavigationView,
} from './application/navigation'
import { navigationHash } from './application/navigation-url'

const analysis = shallowRef<ProjectAnalysis | null>(null)
const filesystem = shallowRef<ProjectFileSystem | null>(null)
const workspaceHistory = shallowRef<NavigationHistory>(initNavigationHistory({ view: 'project', entityId: null }))
const currentEntry = computed(() => currentNavigationEntry(workspaceHistory.value))
const resourceNavigationPaths = computed(() => new Set(
  analysis.value ? buildProjectResourceItems(analysis.value).map((resource) => resource.navigationPath) : [],
))
const canNavigateBack = computed(() => canBack(workspaceHistory.value))
const canNavigateForward = computed(() => canForward(workspaceHistory.value))
const searchQuery = ref('')
const loading = ref(false)
const loadingStage = ref<ProjectLoadStage | null>(null)
const error = ref<string | null>(null)
const browserSupported = canOpenProjectFolder()
let projectSessionId: string | null = null
let tokenCounter = 0

const searchResults = computed(() => analysis.value
  ? searchProjectEntities(analysis.value, searchQuery.value)
  : [])

async function handleOpenProject(): Promise<void> {
  if (!browserSupported || loading.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const openedProject = await openProjectFolder((stage) => {
      loadingStage.value = stage
    })
    if (openedProject) {
      analysis.value = openedProject.analysis
      filesystem.value = openedProject.filesystem
      resetProjectNavigation()
      searchQuery.value = ''
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

async function handleOpenProjectArchive(file: File): Promise<void> {
  if (loading.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const openedProject = await openProjectArchive(file, (stage) => {
      loadingStage.value = stage
    })
    analysis.value = openedProject.analysis
    filesystem.value = openedProject.filesystem
    resetProjectNavigation()
    searchQuery.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

function handleSelectEntity(entityId: string): void {
  if (!analysis.value?.index.byId.has(entityId)) return
  navigate({ view: 'project', entityId })
}

function handleNavigateView(view: NavigationView): void {
  navigate(navigationEntryForView(currentEntry.value, view))
}

function handleGraphFocusChange(entityId: string | null): void {
  if (currentEntry.value.view !== 'graph') return
  const focusEntityId = entityId && analysis.value?.index.byId.has(entityId) ? entityId : null
  navigate({ view: 'graph', focusEntityId })
}

function handleSelectResource(resourcePath: string): void {
  if (!resourcePath || !resourceNavigationPaths.value.has(resourcePath)) return
  navigate({ view: 'resources', resourcePath })
}

function navigate(entry: NavigationEntry): void {
  const previous = workspaceHistory.value
  const next = pushNavigation(previous, entry)
  if (next === previous) return
  workspaceHistory.value = next
  persistNavigation(next, false)
}

function resetProjectNavigation(): void {
  projectSessionId = createOpaqueToken()
  workspaceHistory.value = initNavigationHistory({ view: 'project', entityId: null })
  persistNavigation(workspaceHistory.value, true)
}

function createOpaqueToken(): string {
  tokenCounter += 1
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${tokenCounter.toString(36)}-${Math.random().toString(36).slice(2)}`
}

function persistNavigation(history: NavigationHistory, replace: boolean): void {
  if (!projectSessionId) return
  const entry = currentNavigationEntry(history)
  const browserState = typeof window.history.state === 'object' && window.history.state !== null
    ? window.history.state as Record<string, unknown>
    : {}
  const state = {
    ...browserState,
    c3ForgeNavigation: { projectSessionId, history },
  }
  const hash = navigationHash(entry.view, createOpaqueToken())
  if (replace) {
    window.history.replaceState(state, '', hash)
  } else {
    const previousEntry = history.entries[history.index - 1]
    if (previousEntry) {
      const previousHistory = { entries: history.entries, index: history.index - 1 }
      const previousState = {
        ...browserState,
        c3ForgeNavigation: { projectSessionId, history: previousHistory },
      }
      window.history.replaceState(previousState, '', navigationHash(previousEntry.view, createOpaqueToken()))
    }
    window.history.pushState(state, '', hash)
  }
}

function restoreBrowserNavigation(): void {
  if (!analysis.value || !projectSessionId) return
  const state = window.history.state
  const stored = typeof state === 'object' && state !== null
    ? (state as Record<string, unknown>).c3ForgeNavigation
    : undefined
  if (!isRecord(stored) || stored.projectSessionId !== projectSessionId || !isNavigationHistory(stored.history)) {
    workspaceHistory.value = initNavigationHistory({ view: 'project', entityId: null })
    persistNavigation(workspaceHistory.value, true)
    return
  }
  workspaceHistory.value = sanitizeNavigationHistory(stored.history, analysis.value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNavigationHistory(value: unknown): value is NavigationHistory {
  if (!isRecord(value) || !Array.isArray(value.entries) || !Number.isInteger(value.index)) return false
  if (value.entries.length === 0 || (value.index as number) < 0 || (value.index as number) >= value.entries.length) return false
  return value.entries.every((entry) => {
    if (!isRecord(entry)) return false
    if (entry.view === 'project') return Object.keys(entry).every((key) => key === 'view' || key === 'entityId')
      && (entry.entityId === null || typeof entry.entityId === 'string')
    if (entry.view === 'graph') return Object.keys(entry).every((key) => key === 'view' || key === 'focusEntityId')
      && (entry.focusEntityId === null || typeof entry.focusEntityId === 'string')
    if (entry.view === 'resources') return Object.keys(entry).every((key) => key === 'view' || key === 'resourcePath')
      && (entry.resourcePath === null || typeof entry.resourcePath === 'string')
    return false
  })
}

function sanitizeNavigationHistory(history: NavigationHistory, project: ProjectAnalysis): NavigationHistory {
  const resourcePaths = knownResourcePaths(project)
  return {
    index: history.index,
    entries: history.entries.map((entry): NavigationEntry => {
      switch (entry.view) {
        case 'project':
          return {
            view: 'project',
            entityId: entry.entityId && project.index.byId.has(entry.entityId) ? entry.entityId : null,
          }
        case 'graph':
          return {
            view: 'graph',
            focusEntityId: entry.focusEntityId && project.index.byId.has(entry.focusEntityId) ? entry.focusEntityId : null,
          }
        case 'resources':
          return {
            view: 'resources',
            resourcePath: entry.resourcePath && resourcePaths.has(entry.resourcePath) ? entry.resourcePath : null,
          }
      }
    }),
  }
}

function knownResourcePaths(project: ProjectAnalysis): Set<string> {
  return new Set(buildProjectResourceItems(project).map((resource) => resource.navigationPath))
}

function handlePopState(): void {
  restoreBrowserNavigation()
}

function handleNavigateBack(): void {
  if (canBack(workspaceHistory.value)) window.history.back()
}

function handleNavigateForward(): void {
  if (canForward(workspaceHistory.value)) window.history.forward()
}

function handleClearProject(): void {
  if (loading.value) return
  analysis.value = null
  filesystem.value = null
  projectSessionId = null
  workspaceHistory.value = initNavigationHistory({ view: 'project', entityId: null })
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#`)
  searchQuery.value = ''
  error.value = null
}

onMounted(() => window.addEventListener('popstate', handlePopState))
onUnmounted(() => window.removeEventListener('popstate', handlePopState))
</script>

<template>
  <ProjectWorkspace
    :analysis="analysis"
    :filesystem="filesystem"
    :navigation-entry="currentEntry"
    :can-navigate-back="canNavigateBack"
    :can-navigate-forward="canNavigateForward"
    :search-query="searchQuery"
    :search-results="searchResults"
    :loading="loading"
    :loading-stage="loadingStage"
    :error="error"
    :browser-supported="browserSupported"
    @open-project="handleOpenProject"
    @open-archive="handleOpenProjectArchive"
    @update:search-query="searchQuery = $event"
    @select-entity="handleSelectEntity"
    @navigate-view="handleNavigateView"
    @graph-focus-change="handleGraphFocusChange"
    @select-resource="handleSelectResource"
    @navigate-back="handleNavigateBack"
    @navigate-forward="handleNavigateForward"
    @clear-project="handleClearProject"
  />
</template>
