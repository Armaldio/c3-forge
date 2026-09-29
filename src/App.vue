<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import type { ProjectAnalysis, ProjectLoadStage } from './core/types'
import type { ProjectFileSystem } from './core/filesystem'
import { buildProjectResourceItems } from './features/workspace/resource-model'
import {
  canOpenProjectArchiveWithNativePicker,
  canOpenProjectFolder,
  clearSavedProjectSource,
  loadSavedProjectSource,
  loadProjectSource,
  openProjectArchive,
  openProjectArchiveFromNativePicker,
  openProjectFolder,
  queryProjectSourcePermission,
  requestProjectSourcePermission,
  saveProjectSource,
  searchProjectEntities,
  type OpenedProject,
  type SavedProjectSource,
} from './application/workspace'
import {
  canNavigateBackFromHistoryState,
  canNavigateForwardFromHistoryState,
  entryForWorkspaceSelection,
  forgeNavigationStateFromHistoryState,
  navigationLocationForEntry,
  navigationEntryForProjectSession,
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
const savedProject = shallowRef<SavedProjectSource | null>(null)
const restoreChecking = ref(true)
const persistenceNotice = ref<string | null>(null)
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
const archivePickerSupported = canOpenProjectArchiveWithNativePicker()
const savedProjectName = computed(() => savedProject.value?.source.displayName ?? null)
const canResumeSavedProject = computed(() => !analysis.value && !!savedProject.value)
let projectSessionId: string | null = null
let lastProjectEntry: Extract<NavigationEntry, { workspace: 'project' }> = projectOverviewEntry()
let tokenCounter = 0
let navigationRestoreFinished = false

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

router.afterEach((to, _from, failure) => {
  if (failure || !navigationRestoreFinished) return
  synchronizeNavigation(to.name)
})
void router.isReady().then(() => initializeSavedProject()).catch((cause: unknown) => {
  restoreChecking.value = false
  loading.value = false
  navigationRestoreFinished = true
  error.value = cause instanceof Error ? cause.message : 'The previous project could not be restored.'
  synchronizeNavigation()
})

async function initializeSavedProject(): Promise<void> {
  let saved: SavedProjectSource | null
  try {
    saved = await loadSavedProjectSource()
  } catch {
    persistenceNotice.value = 'This browser could not access saved project handles. Projects can still be opened, but may need to be selected again after a reload.'
    finishProjectRestore()
    return
  }

  savedProject.value = saved
  if (!saved) {
    projectSessionId = null
    finishProjectRestore()
    return
  }

  try {
    projectSessionId = saved.sessionId
    currentEntry.value = navigationEntryForProjectSession(router.options.history.state, saved.sessionId)
    if (currentEntry.value.workspace === 'project') lastProjectEntry = currentEntry.value

    if (await queryProjectSourcePermission(saved.source) === 'granted') {
      await restoreSavedProject(saved)
      return
    }
    finishProjectRestore()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The previous project could not be restored.'
    finishProjectRestore()
  }
}

function finishProjectRestore(): void {
  restoreChecking.value = false
  loading.value = false
  navigationRestoreFinished = true
  synchronizeNavigation()
}

async function restoreSavedProject(saved: SavedProjectSource): Promise<void> {
  loading.value = true
  loadingStage.value = null
  const openedProject = await loadProjectSource(saved.source, (stage) => {
    loadingStage.value = stage
  })
  analysis.value = openedProject.analysis
  filesystem.value = openedProject.filesystem
  persistenceNotice.value = null
  error.value = null
  restoreChecking.value = false
  loading.value = false
  navigationRestoreFinished = true
  synchronizeNavigation()
}

async function handleResumeSavedProject(): Promise<void> {
  const saved = savedProject.value
  if (!saved || loading.value || restoreChecking.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null
  try {
    const permissionRequest = requestProjectSourcePermission(saved.source)
    if (await permissionRequest !== 'granted') {
      throw new Error('Read access was not granted. Choose Resume to request access again, or open the project folder/file.')
    }
    await restoreSavedProject(saved)
  } catch (cause) {
    loading.value = false
    error.value = cause instanceof Error ? cause.message : 'The previous project could not be restored.'
    navigationRestoreFinished = true
    synchronizeNavigation()
  }
}

async function handleOpenProject(): Promise<void> {
  if (!browserSupported || loading.value || restoreChecking.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const openedProject = await openProjectFolder((stage) => {
      loadingStage.value = stage
    })
    if (openedProject) await installOpenedProject(openedProject)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

async function handleOpenProjectArchive(file: File): Promise<void> {
  if (loading.value || restoreChecking.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const openedProject = await openProjectArchive(file, (stage) => {
      loadingStage.value = stage
    })
    await installOpenedProject(openedProject)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

async function handleOpenProjectArchivePicker(): Promise<void> {
  if (loading.value || restoreChecking.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const openedProject = await openProjectArchiveFromNativePicker((stage) => {
      loadingStage.value = stage
    })
    if (openedProject) await installOpenedProject(openedProject)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

async function installOpenedProject(openedProject: OpenedProject): Promise<void> {
  const sessionId = nextRouteToken()
  projectSessionId = sessionId
  lastProjectEntry = projectOverviewEntry()
  currentEntry.value = lastProjectEntry
  analysis.value = openedProject.analysis
  filesystem.value = openedProject.filesystem
  restoreChecking.value = false
  navigationRestoreFinished = true
  await router.push(navigationLocationForEntry(lastProjectEntry, nextRouteToken(), {
    projectSessionId: sessionId,
    canGoBack: false,
  }))

  searchQuery.value = ''
  error.value = null
  if (openedProject.source) {
    const saved = { sessionId, source: openedProject.source }
    try {
      await saveProjectSource(saved)
      savedProject.value = saved
      persistenceNotice.value = null
      return
    } catch {
      let previousHandleCleared = true
      try {
        await clearSavedProjectSource()
      } catch {
        previousHandleCleared = false
      }
      savedProject.value = null
      persistenceNotice.value = previousHandleCleared
        ? 'Project is open, but this browser could not remember its file access for reloads.'
        : 'Project is open, but its previous saved file access could not be cleared and may return after a reload.'
      return
    }
  }

  try {
    await clearSavedProjectSource()
  } catch {
    persistenceNotice.value = 'Project is open, but previous saved file access could not be cleared.'
    savedProject.value = null
    return
  }
  savedProject.value = null
  persistenceNotice.value = 'This archive used a temporary file selection. It must be selected again after a reload.'
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
  navigate(entryForWorkspaceSelection(currentEntry.value, lastProjectEntry, workspace))
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

async function handleClearProject(): Promise<void> {
  if (loading.value) return
  let notice: string | null = null
  try {
    await clearSavedProjectSource()
  } catch {
    notice = 'Saved file access could not be cleared; the project may return after a reload.'
  }
  analysis.value = null
  filesystem.value = null
  projectSessionId = null
  savedProject.value = null
  restoreChecking.value = false
  searchQuery.value = ''
  error.value = null
  persistenceNotice.value = notice
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
      :archive-picker-supported="archivePickerSupported"
      :restore-checking="restoreChecking"
      :saved-project-name="savedProjectName"
      :can-resume-saved-project="canResumeSavedProject"
      :persistence-notice="persistenceNotice"
      @open-project="handleOpenProject"
      @open-archive="handleOpenProjectArchive"
      @open-archive-picker="handleOpenProjectArchivePicker"
      @resume-saved-project="handleResumeSavedProject"
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
