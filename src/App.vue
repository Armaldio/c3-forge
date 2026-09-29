<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import type { ProjectAnalysis, ProjectLoadStage } from './core/types'
import type { ProjectFileSystem } from './core/filesystem'
import { buildProjectResourceItems } from './features/workspace/resource-model'
import { canOpenProjectFolder, openProjectArchive, openProjectFolder, searchProjectEntities } from './application/workspace'
import {
  canNavigateBackFromHistoryState,
  canNavigateForwardFromHistoryState,
  forgeNavigationStateFromHistoryState,
  navigationLocationForEntry,
  projectEntryForView,
  projectOverviewEntry,
  resourceWorkspaceEntry,
  sameNavigationEntry,
  workspaceForRouteName,
  type NavigationEntry,
  type NavigationWorkspace,
} from './application/navigation'

const router = useRouter()

const analysis = shallowRef<ProjectAnalysis | null>(null)
const filesystem = shallowRef<ProjectFileSystem | null>(null)
const currentEntry = shallowRef<NavigationEntry>(projectOverviewEntry())
const navigationRevision = ref(0)
const reactiveHistoryState = computed(() => [navigationRevision.value, router.options.history.state] as const)
const resourceNavigationPaths = computed(() => new Set(
  analysis.value ? buildProjectResourceItems(analysis.value).map((resource) => resource.navigationPath) : [],
))
const canNavigateBack = computed(() => canNavigateBackFromHistoryState(reactiveHistoryState.value[1]))
const canNavigateForward = computed(() => canNavigateForwardFromHistoryState(reactiveHistoryState.value[1]))
const searchQuery = ref('')
const loading = ref(false)
const loadingStage = ref<ProjectLoadStage | null>(null)
const error = ref<string | null>(null)
const browserSupported = canOpenProjectFolder()
let projectSessionId: string | null = null
let lastProjectEntry: Extract<NavigationEntry, { workspace: 'project' }> = projectOverviewEntry()
let tokenCounter = 0

const searchResults = computed(() => analysis.value
  ? searchProjectEntities(analysis.value, searchQuery.value)
  : [])

function nextRouteToken(): string {
  tokenCounter += 1
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${tokenCounter.toString(36)}-${Math.random().toString(36).slice(2)}`
}

function sanitizedEntry(entry: NavigationEntry, project: ProjectAnalysis | null): NavigationEntry {
  if (!project) return entry
  if (entry.workspace === 'project') {
    return {
      workspace: 'project',
      entityId: entry.entityId && project.index.byId.has(entry.entityId) ? entry.entityId : null,
      view: entry.view,
    }
  }
  return {
    workspace: 'resources',
    resourcePath: entry.resourcePath && resourceNavigationPaths.value.has(entry.resourcePath) ? entry.resourcePath : null,
  }
}

function replaceWithSafeEntry(entry: NavigationEntry): void {
  currentEntry.value = entry
  if (entry.workspace === 'project') lastProjectEntry = entry
  void router.replace(navigationLocationForEntry(entry, nextRouteToken(), {
    projectSessionId,
    canGoBack: false,
  }))
}

function synchronizeNavigation(routeName = router.currentRoute.value.name): void {
  const routeWorkspace = workspaceForRouteName(routeName) ?? 'project'
  const stored = forgeNavigationStateFromHistoryState(router.options.history.state)
  if (!stored || stored.entry.workspace !== routeWorkspace || stored.projectSessionId !== projectSessionId) {
    replaceWithSafeEntry(routeWorkspace === 'resources' ? resourceWorkspaceEntry() : projectOverviewEntry())
    navigationRevision.value += 1
    return
  }

  const entry = sanitizedEntry(stored.entry, analysis.value)
  currentEntry.value = entry
  if (entry.workspace === 'project') lastProjectEntry = entry
  navigationRevision.value += 1

  if (!sameNavigationEntry(entry, stored.entry)) {
    void router.replace(navigationLocationForEntry(entry, nextRouteToken(), {
      projectSessionId,
      canGoBack: stored.canGoBack,
    }))
  }
}

let routeSynchronized = false
router.afterEach((to, _from, failure) => {
  if (failure) return
  routeSynchronized = true
  synchronizeNavigation(to.name)
})
void router.isReady().then(() => {
  if (routeSynchronized) return
  routeSynchronized = true
  synchronizeNavigation()
})

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
      await resetProjectNavigation()
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
    await resetProjectNavigation()
    searchQuery.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

async function resetProjectNavigation(): Promise<void> {
  projectSessionId = nextRouteToken()
  lastProjectEntry = projectOverviewEntry()
  await router.push(navigationLocationForEntry(lastProjectEntry, nextRouteToken(), {
    projectSessionId,
    canGoBack: false,
  }))
}

function navigate(entry: NavigationEntry): void {
  const next = sanitizedEntry(entry, analysis.value)
  if (sameNavigationEntry(currentEntry.value, next)) return

  const stored = forgeNavigationStateFromHistoryState(router.options.history.state)
  const canGoBack = projectSessionId !== null && stored?.projectSessionId === projectSessionId
  void router.push(navigationLocationForEntry(next, nextRouteToken(), { projectSessionId, canGoBack }))
}

function handleSelectEntity(entityId: string): void {
  if (!analysis.value?.index.byId.has(entityId)) return
  navigate({ workspace: 'project', entityId, view: 'details' })
}

function handleNavigateProjectView(view: 'details' | 'graph'): void {
  const currentProjectEntry = currentEntry.value.workspace === 'project' ? currentEntry.value : lastProjectEntry
  navigate(projectEntryForView(currentProjectEntry, view))
}

function handleNavigateWorkspace(workspace: NavigationWorkspace): void {
  if (workspace === 'resources') {
    navigate(resourceWorkspaceEntry())
    return
  }
  navigate(currentEntry.value.workspace === 'project' ? currentEntry.value : lastProjectEntry)
}

function handleNavigateProjectRoot(): void {
  navigate(projectOverviewEntry())
}

function handleGraphFocusChange(entityId: string | null): void {
  if (currentEntry.value.workspace !== 'project' || currentEntry.value.view !== 'graph') return
  const selectedEntityId = entityId && analysis.value?.index.byId.has(entityId) ? entityId : null
  navigate({ workspace: 'project', entityId: selectedEntityId, view: 'graph' })
}

function handleSelectResource(resourcePath: string): void {
  if (!resourcePath || !resourceNavigationPaths.value.has(resourcePath)) return
  navigate({ workspace: 'resources', resourcePath })
}

function handleNavigateBack(): void {
  if (canNavigateBack.value) router.back()
}

function handleNavigateForward(): void {
  if (canNavigateForward.value) router.forward()
}

function handleClearProject(): void {
  if (loading.value) return
  analysis.value = null
  filesystem.value = null
  projectSessionId = null
  searchQuery.value = ''
  error.value = null
  void router.push(navigationLocationForEntry(projectOverviewEntry(), nextRouteToken(), {
    projectSessionId: null,
    canGoBack: false,
  }))
}
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component
      :is="Component"
      v-if="Component"
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
      @navigate-workspace="handleNavigateWorkspace"
      @navigate-project-view="handleNavigateProjectView"
      @navigate-project-root="handleNavigateProjectRoot"
      @graph-focus-change="handleGraphFocusChange"
      @select-resource="handleSelectResource"
      @navigate-back="handleNavigateBack"
      @navigate-forward="handleNavigateForward"
      @clear-project="handleClearProject"
    />
  </RouterView>
</template>
