<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { EntityKind, ForgeEntity, ProjectAnalysis, ProjectLoadStage } from '../../core/types'
import type { ProjectFileSystem } from '../../core/filesystem'
import type { NavigationEntry, NavigationWorkspace, ProjectNavigationView } from '../../application/navigation'
import EntityExplorer from './EntityExplorer.vue'
import EntityView from './EntityView.vue'
import GlobalSearch from './GlobalSearch.vue'
import ProjectDiagnostics from './ProjectDiagnostics.vue'
import ProjectOverview from './ProjectOverview.vue'
import RelationshipGraph from './RelationshipGraph.vue'
import ResourcesView from './ResourcesView.vue'
import { loadStageLabel, summarizeProjectDiagnostics } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis | null
  filesystem: ProjectFileSystem | null
  navigationEntry: NavigationEntry
  canNavigateBack: boolean
  canNavigateForward: boolean
  searchQuery: string
  searchResults: readonly ForgeEntity[]
  loading: boolean
  loadingStage: ProjectLoadStage | null
  error: string | null
  browserSupported: boolean
  archivePickerSupported: boolean
  restoreChecking: boolean
  savedProjectName: string | null
  canResumeSavedProject: boolean
  persistenceNotice: string | null
}>()

const emit = defineEmits<{
  'open-project': []
  'open-archive': [file: File]
  'open-archive-picker': []
  'resume-saved-project': []
  'update:searchQuery': [value: string]
  'select-entity': [id: string]
  'select-resource': [path: string]
  'navigate-workspace': [workspace: NavigationWorkspace]
  'navigate-project-view': [view: ProjectNavigationView]
  'navigate-project-root': []
  'navigate-back': []
  'navigate-forward': []
  'graph-focus-change': [id: string | null]
  'clear-project': []
}>()

const loadingLabel = computed(() => props.loadingStage ? loadStageLabel[props.loadingStage] : 'Preparing project')
const archiveInput = ref<HTMLInputElement | null>(null)
const projectMenu = ref<HTMLDetailsElement | null>(null)
const diagnosticsToggle = ref<HTMLButtonElement | null>(null)
const explorer = ref<{ revealKind: (kind: EntityKind) => Promise<void> } | null>(null)
const diagnosticsOpen = ref(false)
const activeWorkspace = computed(() => props.navigationEntry.workspace)
const projectView = computed(() => props.navigationEntry.workspace === 'project' ? props.navigationEntry.view : null)
const projectEntityId = computed(() => props.navigationEntry.workspace === 'project' ? props.navigationEntry.entityId : null)
const graphFocusEntityId = computed(() => props.navigationEntry.workspace === 'project' && props.navigationEntry.view === 'graph'
  ? props.navigationEntry.entityId
  : null)
const resourcePath = computed(() => props.navigationEntry.workspace === 'resources' ? props.navigationEntry.resourcePath : null)
const explorerSelectedEntityId = computed(() => {
  return props.navigationEntry.workspace === 'project' ? props.navigationEntry.entityId : null
})
const diagnosticSummary = computed(() => summarizeProjectDiagnostics(props.analysis?.diagnostics ?? []))
watch(() => diagnosticSummary.value.total, (total) => {
  if (total === 0) diagnosticsOpen.value = false
})
const diagnosticMark = computed(() => {
  if (diagnosticSummary.value.state === 'clear') return '✓'
  if (diagnosticSummary.value.state === 'info') return 'i'
  return '!'
})

function closeProjectMenu(): void {
  if (projectMenu.value) projectMenu.value.open = false
}

function chooseFolder(): void {
  if (props.loading || props.restoreChecking || !props.browserSupported) return
  closeProjectMenu()
  emit('open-project')
}

function chooseArchive(): void {
  if (props.loading || props.restoreChecking) return
  closeProjectMenu()
  if (props.archivePickerSupported) emit('open-archive-picker')
  else archiveInput.value?.click()
}

function toggleDiagnostics(): void {
  diagnosticsOpen.value = !diagnosticsOpen.value
}

function closeDiagnostics(): void {
  diagnosticsOpen.value = false
  void nextTick(() => diagnosticsToggle.value?.focus())
}

function openGraphEntity(entityId: string): void {
  emit('select-entity', entityId)
}

function revealExplorerKind(kind: 'object' | 'eventSheet'): void {
  void explorer.value?.revealKind(kind)
}

function selectWorkspace(workspace: NavigationWorkspace): void {
  emit('navigate-workspace', workspace)
}

function selectProjectView(view: ProjectNavigationView): void {
  emit('navigate-project-view', view)
}

function selectOverviewAction(view: 'graph' | 'resources'): void {
  if (view === 'resources') selectWorkspace('resources')
  else selectProjectView('graph')
}

function selectSearchResult(entityId: string): void {
  emit('select-entity', entityId)
  emit('update:searchQuery', '')
}

function handleArchiveSelection(event: Event): void {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('open-archive', file)
}
</script>

<template>
  <div class="forge-shell">
    <input
      ref="archiveInput"
      class="archive-input"
      type="file"
      accept=".c3p"
      aria-label="Choose a Construct 3 project archive"
      @change="handleArchiveSelection"
    >
    <a
      class="skip-link"
      href="#main-content"
    >Skip to main content</a>
    <header class="app-header">
      <a
        class="brand-lockup"
        href="#main-content"
        aria-label="C3 Forge workspace"
      >
        <span
          class="brand-mark"
          aria-hidden="true"
        >C3</span>
        <span class="brand-wordmark">FORGE</span>
      </a>
      <div class="header-context">
        <span
          class="header-divider"
          aria-hidden="true"
        />
        <span
          v-if="analysis"
          class="header-project-name"
          :title="analysis.manifest.name"
        >{{ analysis.manifest.name }}</span>
        <span
          v-else
          class="header-project-name muted"
        >Local project analyzer</span>
      </div>
      <div class="header-right">
        <span class="privacy-indicator"><span aria-hidden="true" /> Local only</span>
        <button
          v-if="analysis"
          class="text-button clear-project-button"
          type="button"
          :disabled="loading"
          @click="emit('clear-project')"
        >
          Close project
        </button>
      </div>
    </header>

    <main
      id="main-content"
      class="app-main"
      tabindex="-1"
    >
      <div
        v-if="analysis"
        class="workspace-toolbar"
      >
        <GlobalSearch
          :query="searchQuery"
          :results="searchResults"
          @update:query="emit('update:searchQuery', $event)"
          @select="selectSearchResult"
        />
        <details
          ref="projectMenu"
          class="project-open-menu"
        >
          <summary class="open-project-button open-menu-trigger">
            Open <span aria-hidden="true">▾</span>
          </summary>
          <div class="project-open-menu-list">
            <button
              type="button"
              :disabled="loading || restoreChecking || !browserSupported"
              @click="chooseFolder"
            >
              Open folder project
            </button>
            <button
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseArchive"
            >
              Open .c3p archive
            </button>
          </div>
        </details>
      </div>

      <div
        v-if="loading && analysis"
        class="inline-progress"
        role="status"
        aria-live="polite"
      >
        <span
          class="progress-pulse"
          aria-hidden="true"
        />{{ loadingLabel }}
      </div>

      <div
        v-if="persistenceNotice"
        class="persistence-notice"
        role="status"
      >
        {{ persistenceNotice }}
      </div>

      <div
        v-if="error"
        class="error-banner"
        role="alert"
      >
        <span
          class="error-marker"
          aria-hidden="true"
        >!</span>
        <div><strong>Project could not be loaded</strong><p>{{ error }}</p></div>
        <button
          class="text-button"
          type="button"
          :disabled="loading || !browserSupported"
          @click="chooseFolder"
        >
          Try another folder
        </button>
        <button
          v-if="canResumeSavedProject"
          class="text-button"
          type="button"
          :disabled="loading"
          @click="emit('resume-saved-project')"
        >
          Resume {{ savedProjectName }}
        </button>
        <button
          class="text-button"
          type="button"
          :disabled="loading"
          @click="chooseArchive"
        >
          Open .c3p archive
        </button>
      </div>

      <template v-if="analysis">
        <nav
          class="workspace-navigation"
          aria-label="Workspaces"
        >
          <div
            class="workspace-history-controls"
            role="group"
            aria-label="Navigation history"
          >
            <button
              type="button"
              aria-label="Go back"
              title="Go back"
              :disabled="!canNavigateBack"
              @click="emit('navigate-back')"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Go forward"
              title="Go forward"
              :disabled="!canNavigateForward"
              @click="emit('navigate-forward')"
            >
              →
            </button>
          </div>
          <div class="workspace-primary-navigation">
            <button
              type="button"
              :aria-current="activeWorkspace === 'project' ? 'page' : undefined"
              @click="emit('navigate-project-root')"
            >
              Project
            </button>
            <button
              type="button"
              :aria-current="activeWorkspace === 'resources' ? 'page' : undefined"
              @click="selectWorkspace('resources')"
            >
              Resources
            </button>
          </div>
        </nav>

        <section
          v-if="activeWorkspace === 'project'"
          id="project-workspace"
          class="project-workspace-layout"
          aria-label="Project workspace"
        >
          <EntityExplorer
            ref="explorer"
            :analysis="analysis"
            :selected-entity-id="explorerSelectedEntityId"
            @select="emit('select-entity', $event)"
          />
          <div class="project-main">
            <nav
              class="project-context-tabs"
              role="tablist"
              :aria-label="projectEntityId ? 'Entity views' : 'Project views'"
            >
              <button
                id="project-tab-details"
                type="button"
                role="tab"
                :aria-selected="projectView === 'details'"
                aria-controls="workspace-panel-project-details"
                @click="selectProjectView('details')"
              >
                {{ projectEntityId ? 'Details' : 'Overview' }}
              </button>
              <button
                id="project-tab-graph"
                type="button"
                role="tab"
                :aria-selected="projectView === 'graph'"
                aria-controls="workspace-panel-graph"
                @click="selectProjectView('graph')"
              >
                Graph
              </button>
            </nav>
            <section
              v-show="projectView === 'details'"
              id="workspace-panel-project-details"
              class="workspace-view-panel"
              role="tabpanel"
              aria-labelledby="project-tab-details"
            >
              <ProjectOverview
                v-if="!projectEntityId"
                :analysis="analysis"
                @explore-kind="revealExplorerKind"
                @navigate-view="selectOverviewAction"
              />
              <EntityView
                v-else
                :analysis="analysis"
                :selected-entity-id="projectEntityId"
                @select="emit('select-entity', $event)"
                @navigate-project-root="emit('navigate-project-root')"
              />
            </section>
            <section
              v-show="projectView === 'graph'"
              id="workspace-panel-graph"
              class="workspace-view-panel"
              role="tabpanel"
              aria-labelledby="project-tab-graph"
            >
              <RelationshipGraph
                :analysis="analysis"
                :graph-focus-entity-id="graphFocusEntityId"
                :root-graph="projectEntityId === null"
                @open-entity="openGraphEntity"
                @update:graph-focus-entity-id="emit('graph-focus-change', $event)"
              />
            </section>
          </div>
        </section>

        <section
          v-else
          class="resources-workspace"
          aria-label="Resources workspace"
        >
          <ResourcesView
            v-if="filesystem"
            :analysis="analysis"
            :filesystem="filesystem"
            :resource-path="resourcePath"
            @select-resource="emit('select-resource', $event)"
          />
        </section>

        <div class="workspace-statusbar">
          <p
            class="project-health"
            :data-health="diagnosticSummary.state"
            role="status"
          >
            <span aria-hidden="true">{{ diagnosticMark }}</span>
            {{ diagnosticSummary.label }}
          </p>
          <button
            v-if="diagnosticSummary.total > 0"
            ref="diagnosticsToggle"
            class="diagnostics-toggle"
            type="button"
            aria-controls="diagnostics-drawer"
            :aria-expanded="diagnosticsOpen"
            @click="toggleDiagnostics"
          >
            Diagnostics <span>{{ diagnosticSummary.total }}</span>
          </button>
        </div>

        <div
          v-if="diagnosticSummary.total > 0"
          v-show="diagnosticsOpen"
          id="diagnostics-drawer"
          :inert="!diagnosticsOpen"
          class="diagnostics-drawer"
        >
          <ProjectDiagnostics
            :analysis="analysis"
            @close="closeDiagnostics"
          />
        </div>
      </template>

      <section
        v-else-if="loading"
        class="welcome-state"
        aria-labelledby="welcome-title"
        aria-live="polite"
      >
        <div class="state-index">
          C3 / LOCAL ANALYSIS
        </div>
        <div
          class="loading-glyph"
          aria-hidden="true"
        >
          <span /><span /><span />
        </div>
        <p class="eyebrow">
          Reading project files
        </p>
        <h1 id="welcome-title">
          {{ loadingLabel }}
        </h1>
        <p class="state-description">
          Forge is indexing project files locally. Larger projects may take a little longer.
        </p>
        <ol
          class="stage-list"
          aria-label="Analysis pipeline"
        >
          <li
            v-for="(label, stage) in loadStageLabel"
            :key="stage"
            :class="{ 'stage-current': stage === loadingStage }"
            :aria-current="stage === loadingStage ? 'step' : undefined"
          >
            {{ label }}
          </li>
        </ol>
      </section>

      <section
        v-else-if="!error"
        class="welcome-state"
        aria-labelledby="welcome-title"
      >
        <div class="state-index">
          C3 / LOCAL ANALYSIS
        </div>
        <div
          v-if="canResumeSavedProject && savedProjectName"
          class="saved-project-resume"
          role="group"
          aria-label="Previously opened project"
        >
          <div>
            <strong>Continue {{ savedProjectName }}</strong>
            <p>Reconnect to the previously opened project to restore it.</p>
          </div>
          <button
            class="open-project-button state-action"
            type="button"
            :disabled="loading"
            @click="emit('resume-saved-project')"
          >
            Resume project
          </button>
        </div>
        <p
          v-else-if="restoreChecking"
          class="state-footnote"
          role="status"
        >
          Checking for a previously opened project…
        </p>
        <template v-if="!browserSupported">
          <div
            class="state-mark unsupported-mark"
            aria-hidden="true"
          >
            ↗
          </div>
          <p class="eyebrow">
            Browser requirement
          </p>
          <h1 id="welcome-title">
            Open a folder or archive.
          </h1>
          <p class="state-description">
            Folder selection needs Chromium over HTTPS or localhost. You can open a <code>.c3p</code> archive directly in this browser.
          </p>
          <div class="project-open-actions state-actions">
            <button
              class="open-project-button state-action"
              type="button"
              disabled
            >
              Open project folder
            </button>
            <button
              class="open-project-button archive-open-button state-action"
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseArchive"
            >
              <span aria-hidden="true">▣</span>Open .c3p archive
            </button>
          </div>
        </template>
        <template v-else>
          <div
            class="state-mark"
            aria-hidden="true"
          >
            C3
          </div>
          <p class="eyebrow">
            Local Construct analysis
          </p>
          <h1 id="welcome-title">
            See how your project fits together.
          </h1>
          <p class="state-description">
            Choose a Construct 3 folder project or a <code>.c3p</code> archive to index entities, follow references, and review resource issues. Forge never writes to project files.
          </p>
          <div class="project-open-actions state-actions">
            <button
              class="open-project-button state-action"
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseFolder"
            >
              <span aria-hidden="true">+</span>Open project folder
            </button>
            <button
              class="open-project-button archive-open-button state-action"
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseArchive"
            >
              <span aria-hidden="true">▣</span>Open .c3p archive
            </button>
          </div>
          <p class="state-footnote">
            Select a folder containing <code>project.c3proj</code>
          </p>
        </template>
      </section>

      <footer class="app-footer">
        <span>Construct 3 project analyzer</span>
        <span>Read-only by design</span>
      </footer>
    </main>
  </div>
</template>
