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
  <div class="forge-shell flex min-h-dvh flex-col">
    <input
      ref="archiveInput"
      class="archive-input hidden"
      type="file"
      accept=".c3p"
      aria-label="Choose a Construct 3 project archive"
      @change="handleArchiveSelection"
    >
    <a
      class="skip-link absolute top-[-48px] left-3 z-10 rounded border border-[#a6c66b] bg-accent px-[11px] py-2 text-[11px] font-bold text-[#172115] no-underline focus-visible:top-2"
      href="#main-content"
    >Skip to main content</a>
    <header class="app-header relative z-[5] flex h-[54px] min-h-[54px] items-center gap-4 border-b border-line bg-[#101922] px-[21px] max-[760px]:gap-[10px] max-[760px]:px-3">
      <a
        class="brand-lockup inline-flex shrink-0 items-center gap-2 text-text no-underline"
        href="#main-content"
        aria-label="C3 Forge workspace"
      >
        <span
          class="brand-mark grid h-[27px] w-[27px] place-items-center rounded-[6px_6px_6px_1px] border border-[#8ba85c] font-mono text-[11px] font-medium leading-none tracking-[-1px] text-accent"
          aria-hidden="true"
        >C3</span>
        <span class="brand-wordmark text-[11px] font-bold tracking-[.13em] max-[760px]:hidden">FORGE</span>
      </a>
      <div class="header-context flex min-w-0 items-center gap-4 text-text-muted max-[760px]:flex-1">
        <span
          class="header-divider h-[18px] w-px bg-line max-[760px]:hidden"
          aria-hidden="true"
        />
        <span
          v-if="analysis"
          class="header-project-name max-w-[min(40vw,470px)] truncate text-xs font-medium text-text max-[760px]:max-w-full"
          :title="analysis.manifest.name"
        >{{ analysis.manifest.name }}</span>
        <span
          v-else
          class="header-project-name muted max-w-[min(40vw,470px)] truncate text-xs font-normal text-text-muted max-[760px]:max-w-full"
        >Local project analyzer</span>
      </div>
      <div class="header-right ml-auto flex items-center gap-[17px]">
        <span class="privacy-indicator inline-flex items-center gap-[7px] text-[11px] text-text-muted max-[760px]:hidden"><span
          class="size-[6px] rounded-full bg-accent shadow-[0_0_0_3px_rgb(200_237_122_/_10%)]"
          aria-hidden="true"
        /> Local only</span>
        <button
          v-if="analysis"
          class="text-button clear-project-button min-h-[30px] rounded border border-transparent bg-transparent px-2 py-1 text-[11px] text-text-muted hover:border-line hover:text-text disabled:cursor-not-allowed disabled:text-[#687783] disabled:hover:border-transparent max-[760px]:hidden"
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
      class="app-main flex min-h-0 w-full flex-1 flex-col"
      tabindex="-1"
    >
      <div
        v-if="analysis"
        class="workspace-toolbar relative z-[4] flex min-h-[58px] items-center gap-[14px] border-b border-line bg-[#111a23] px-5 py-2.5 max-[760px]:gap-2 max-[760px]:px-[10px] max-[760px]:py-[9px]"
      >
        <GlobalSearch
          :query="searchQuery"
          :results="searchResults"
          @update:query="emit('update:searchQuery', $event)"
          @select="selectSearchResult"
        />
        <details
          ref="projectMenu"
          class="project-open-menu relative shrink-0"
        >
          <summary class="open-project-button open-menu-trigger inline-flex min-h-[34px] min-w-[82px] shrink-0 cursor-pointer list-none items-center justify-center gap-[7px] rounded border border-[#a6c66b] bg-accent px-3 text-[11px] font-bold text-[#172115] hover:bg-[#d8f69c] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] max-[760px]:min-w-[68px] max-[760px]:px-2 max-[760px]:text-[11px] [&>span]:text-[17px] [&>span]:font-normal [&>span]:leading-[.7]">
            Open <span aria-hidden="true">▾</span>
          </summary>
          <div class="project-open-menu-list absolute top-[calc(100%+6px)] right-0 z-[8] w-[190px] rounded-[5px] border border-[#354652] bg-[#15212b] p-1 shadow-[0_12px_30px_rgb(0_0_0_/_34%)]">
            <button
              class="min-h-9 w-full cursor-pointer rounded-[3px] border-0 bg-transparent px-[9px] py-[7px] text-left text-xs text-text hover:bg-surface-active focus-visible:bg-surface-active disabled:cursor-not-allowed disabled:text-text-dim"
              type="button"
              :disabled="loading || restoreChecking || !browserSupported"
              @click="chooseFolder"
            >
              Open folder project
            </button>
            <button
              class="min-h-9 w-full cursor-pointer rounded-[3px] border-0 bg-transparent px-[9px] py-[7px] text-left text-xs text-text hover:bg-surface-active focus-visible:bg-surface-active disabled:cursor-not-allowed disabled:text-text-dim"
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
        class="inline-progress flex min-h-7 items-center gap-2 border-b border-line-soft px-5 text-[11px] text-text-muted"
        role="status"
        aria-live="polite"
      >
        <span
          class="progress-pulse size-[6px] rounded-full bg-accent"
          aria-hidden="true"
        />{{ loadingLabel }}
      </div>

      <div
        v-if="persistenceNotice"
        class="persistence-notice border-b border-line bg-[#172119] px-5 py-[7px] text-[11px] text-[#c9d6b4]"
        role="status"
      >
        {{ persistenceNotice }}
      </div>

      <div
        v-if="error"
        class="error-banner flex items-center gap-[10px] border-b border-[#684943] bg-[#291b1b] px-5 py-[9px] text-[#f0d1ca] max-[760px]:items-start max-[760px]:px-3 max-[760px]:py-[10px] max-[420px]:flex-wrap"
        role="alert"
      >
        <span
          class="error-marker grid size-[18px] shrink-0 place-items-center rounded-full border border-[#9d5a50] font-mono text-[11px] leading-none text-error"
          aria-hidden="true"
        >!</span>
        <div>
          <strong class="block text-[11px]">Project could not be loaded</strong><p class="mt-px mb-0 break-words text-[11px] text-[#d1a9a2]">
            {{ error }}
          </p>
        </div>
        <button
          class="text-button ml-auto min-h-[30px] rounded border border-transparent bg-transparent px-2 py-1 text-[11px] text-[#edb8ac] hover:border-line hover:text-text disabled:cursor-not-allowed disabled:text-[#687783] disabled:hover:border-transparent max-[760px]:self-center max-[760px]:shrink-0 max-[420px]:ml-[27px]"
          type="button"
          :disabled="loading || !browserSupported"
          @click="chooseFolder"
        >
          Try another folder
        </button>
        <button
          v-if="canResumeSavedProject"
          class="text-button ml-auto min-h-[30px] rounded border border-transparent bg-transparent px-2 py-1 text-[11px] text-[#edb8ac] hover:border-line hover:text-text disabled:cursor-not-allowed disabled:text-[#687783] disabled:hover:border-transparent max-[760px]:self-center max-[760px]:shrink-0 max-[420px]:ml-[27px]"
          type="button"
          :disabled="loading"
          @click="emit('resume-saved-project')"
        >
          Resume {{ savedProjectName }}
        </button>
        <button
          class="text-button ml-auto min-h-[30px] rounded border border-transparent bg-transparent px-2 py-1 text-[11px] text-[#edb8ac] hover:border-line hover:text-text disabled:cursor-not-allowed disabled:text-[#687783] disabled:hover:border-transparent max-[760px]:self-center max-[760px]:shrink-0 max-[420px]:ml-[27px]"
          type="button"
          :disabled="loading"
          @click="chooseArchive"
        >
          Open .c3p archive
        </button>
      </div>

      <template v-if="analysis">
        <nav
          class="workspace-navigation flex min-h-[54px] min-w-0 shrink-0 items-center gap-2.5 border-b border-line bg-[#101922] px-[22px] max-[760px]:gap-[5px] max-[760px]:px-[10px]"
          aria-label="Workspaces"
        >
          <div
            class="workspace-history-controls flex shrink-0 gap-[3px] max-[760px]:gap-0"
            role="group"
            aria-label="Navigation history"
          >
            <button
              class="h-[29px] w-[29px] cursor-pointer border border-transparent bg-transparent text-[17px] leading-none text-text-muted hover:border-line hover:bg-[#18232d] hover:text-text focus-visible:border-line focus-visible:bg-[#18232d] focus-visible:text-text disabled:cursor-default disabled:text-[#56636b]"
              type="button"
              aria-label="Go back"
              title="Go back"
              :disabled="!canNavigateBack"
              @click="emit('navigate-back')"
            >
              ←
            </button>
            <button
              class="h-[29px] w-[29px] cursor-pointer border border-transparent bg-transparent text-[17px] leading-none text-text-muted hover:border-line hover:bg-[#18232d] hover:text-text focus-visible:border-line focus-visible:bg-[#18232d] focus-visible:text-text disabled:cursor-default disabled:text-[#56636b]"
              type="button"
              aria-label="Go forward"
              title="Go forward"
              :disabled="!canNavigateForward"
              @click="emit('navigate-forward')"
            >
              →
            </button>
          </div>
          <div class="workspace-primary-navigation ml-2 flex self-stretch items-stretch gap-[6px] max-[760px]:ml-[3px] max-[760px]:flex-1 max-[760px]:gap-0.5">
            <button
              class="min-h-12 min-w-[104px] cursor-pointer border-0 border-b-[3px] border-transparent bg-transparent px-[14px] py-[9px] text-[13px] font-semibold text-text-muted aria-[current=page]:border-accent aria-[current=page]:bg-[#17232b] aria-[current=page]:text-text max-[760px]:min-w-0 max-[760px]:flex-1 max-[760px]:px-2"
              type="button"
              :aria-current="activeWorkspace === 'project' ? 'page' : undefined"
              @click="emit('navigate-project-root')"
            >
              Project
            </button>
            <button
              class="min-h-12 min-w-[104px] cursor-pointer border-0 border-b-[3px] border-transparent bg-transparent px-[14px] py-[9px] text-[13px] font-semibold text-text-muted aria-[current=page]:border-accent aria-[current=page]:bg-[#17232b] aria-[current=page]:text-text max-[760px]:min-w-0 max-[760px]:flex-1 max-[760px]:px-2"
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
          class="project-workspace-layout grid min-h-0 flex-1 grid-cols-[minmax(230px,.28fr)_minmax(0,1fr)] max-[1120px]:grid-cols-[minmax(210px,.75fr)_minmax(360px,2fr)] max-[760px]:min-h-0 max-[760px]:flex max-[760px]:flex-col"
          aria-label="Project workspace"
        >
          <EntityExplorer
            ref="explorer"
            :analysis="analysis"
            :selected-entity-id="explorerSelectedEntityId"
            @select="emit('select-entity', $event)"
          />
          <div class="project-main flex min-h-0 min-w-0 flex-col overflow-auto bg-canvas max-[760px]:min-h-0 max-[760px]:flex-none max-[760px]:overflow-visible">
            <nav
              class="project-context-tabs flex shrink-0 items-stretch gap-[5px] border-b border-line bg-[#141e27] px-[22px] max-[760px]:px-[14px]"
              role="tablist"
              :aria-label="projectEntityId ? 'Entity views' : 'Project views'"
            >
              <button
                id="project-tab-details"
                class="min-h-9 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-[10px] py-[7px] text-xs text-text-muted aria-[selected=true]:border-accent aria-[selected=true]:text-text"
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
                class="min-h-9 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-[10px] py-[7px] text-xs text-text-muted aria-[selected=true]:border-accent aria-[selected=true]:text-text"
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
              class="workspace-view-panel min-w-0"
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
              class="workspace-view-panel min-w-0"
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
          class="resources-workspace flex min-h-0 min-w-0 flex-1 bg-canvas max-[760px]:min-h-0 max-[760px]:flex-none"
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

        <div class="workspace-statusbar flex min-h-10 shrink-0 items-center justify-between gap-3 border-t border-line bg-[#101922] px-[14px]">
          <p
            class="project-health m-0 flex min-w-0 items-center gap-2 text-xs text-[#b2c59c]"
            :class="{
              'text-[#e8a49b]': diagnosticSummary.state === 'error',
              'text-[#e3bf7e]': diagnosticSummary.state === 'warning',
              'text-[#a4c6dd]': diagnosticSummary.state === 'info',
            }"
            :data-health="diagnosticSummary.state"
            role="status"
          >
            <span
              class="inline-grid size-[18px] shrink-0 place-items-center rounded-full border border-[#53694a] text-[11px] text-accent"
              :class="{
                'border-[#80514b] text-error': diagnosticSummary.state === 'error',
                'border-[#766540] text-warning': diagnosticSummary.state === 'warning',
                'border-[#4c6575] text-info': diagnosticSummary.state === 'info',
              }"
              aria-hidden="true"
            >{{ diagnosticMark }}</span>
            {{ diagnosticSummary.label }}
          </p>
          <button
            v-if="diagnosticSummary.total > 0"
            ref="diagnosticsToggle"
            class="inline-flex min-h-[31px] cursor-pointer items-center gap-2 rounded border border-transparent bg-transparent px-[7px] py-1 text-[11px] text-text-muted hover:border-line hover:text-text aria-[expanded=true]:border-line aria-[expanded=true]:text-text"
            type="button"
            aria-controls="diagnostics-drawer"
            :aria-expanded="diagnosticsOpen"
            @click="toggleDiagnostics"
          >
            Diagnostics <span class="min-w-5 rounded-[10px] border border-line px-[5px] py-px text-center text-[11px] text-inherit">{{ diagnosticSummary.total }}</span>
          </button>
        </div>

        <div
          v-if="diagnosticSummary.total > 0"
          v-show="diagnosticsOpen"
          id="diagnostics-drawer"
          :inert="!diagnosticsOpen"
          class="diagnostics-drawer min-h-0 max-h-[min(38vh,420px)] flex-[0_1_auto] overflow-auto border-t border-line bg-[#111a23]"
        >
          <ProjectDiagnostics
            :analysis="analysis"
            @close="closeDiagnostics"
          />
        </div>
      </template>

      <section
        v-else-if="loading"
        class="welcome-state flex min-h-[min(690px,calc(100dvh-120px))] flex-1 flex-col items-start justify-center bg-[linear-gradient(90deg,transparent_0_49.95%,rgb(137_164_125_/_4%)_50%,transparent_50.05%),linear-gradient(0deg,transparent_0_49.95%,rgb(137_164_125_/_4%)_50%,transparent_50.05%)] bg-[length:44px_44px] px-[clamp(24px,13vw,190px)] py-[clamp(30px,9vh,90px)] max-[760px]:min-h-[calc(100dvh-86px)] max-[760px]:px-[22px] max-[760px]:py-[45px]"
        aria-labelledby="welcome-title"
        aria-live="polite"
      >
        <div class="state-index mb-[30px] text-[10px] tracking-[.1em] text-[#708171]">
          C3 / LOCAL ANALYSIS
        </div>
        <div
          class="loading-glyph mb-[19px] flex h-10 items-center gap-[5px]"
          aria-hidden="true"
        >
          <span class="h-5 w-1 bg-[#9cbb61]" /><span class="h-[31px] w-1 bg-accent" /><span class="h-[13px] w-1 bg-[#839e52]" />
        </div>
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          Reading project files
        </p>
        <h1
          id="welcome-title"
          class="m-0 max-w-[570px] text-[clamp(27px,4vw,42px)] font-medium leading-[1.1] tracking-[-.055em] text-text"
        >
          {{ loadingLabel }}
        </h1>
        <p class="state-description mt-3 mb-0 max-w-[510px] text-xs leading-[1.65] text-text-muted">
          Forge is indexing project files locally. Larger projects may take a little longer.
        </p>
        <ol
          class="stage-list mt-[30px] mb-0 grid list-none grid-cols-[repeat(2,max-content)] gap-x-[22px] gap-y-[7px] p-0 max-[760px]:grid-cols-1 max-[760px]:gap-[5px]"
          aria-label="Analysis pipeline"
        >
          <li
            v-for="(label, stage) in loadStageLabel"
            :key="stage"
            class="text-[10px] text-[#667581]"
            :class="{ 'stage-current text-accent': stage === loadingStage }"
            :aria-current="stage === loadingStage ? 'step' : undefined"
          >
            {{ label }}
          </li>
        </ol>
      </section>

      <section
        v-else-if="!error"
        class="welcome-state flex min-h-[min(690px,calc(100dvh-120px))] flex-1 flex-col items-start justify-center bg-[linear-gradient(90deg,transparent_0_49.95%,rgb(137_164_125_/_4%)_50%,transparent_50.05%),linear-gradient(0deg,transparent_0_49.95%,rgb(137_164_125_/_4%)_50%,transparent_50.05%)] bg-[length:44px_44px] px-[clamp(24px,13vw,190px)] py-[clamp(30px,9vh,90px)] max-[760px]:min-h-[calc(100dvh-86px)] max-[760px]:px-[22px] max-[760px]:py-[45px]"
        aria-labelledby="welcome-title"
      >
        <div class="state-index mb-[30px] text-[10px] tracking-[.1em] text-[#708171]">
          C3 / LOCAL ANALYSIS
        </div>
        <div
          v-if="canResumeSavedProject && savedProjectName"
          class="saved-project-resume mb-[22px] flex w-full max-w-[520px] items-center justify-between gap-4 rounded-lg border border-[#3b4a3d] bg-[#151f18] px-4 py-[14px] max-[760px]:items-start max-[760px]:flex-col"
          role="group"
          aria-label="Previously opened project"
        >
          <div>
            <strong class="text-xs text-text">Continue {{ savedProjectName }}</strong>
            <p class="mt-[3px] mb-0 text-[11px] text-text-muted">
              Reconnect to the previously opened project to restore it.
            </p>
          </div>
          <button
            class="open-project-button state-action mt-0 inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded border border-[#a6c66b] bg-accent px-[14px] text-[11px] font-bold text-[#172115] hover:bg-[#d8f69c] disabled:cursor-not-allowed disabled:border-[#4c5c4a] disabled:bg-[#344033] disabled:text-[#a9b69e]"
            type="button"
            :disabled="loading"
            @click="emit('resume-saved-project')"
          >
            Resume project
          </button>
        </div>
        <p
          v-else-if="restoreChecking"
          class="state-footnote mt-3 mb-0 text-[10px] text-text-dim"
          role="status"
        >
          Checking for a previously opened project…
        </p>
        <template v-if="!browserSupported">
          <div
            class="state-mark unsupported-mark mb-[21px] grid size-[50px] place-items-center rounded-[9px_9px_9px_1px] border border-[#516370] text-[20px] text-[#9db0bd]"
            aria-hidden="true"
          >
            ↗
          </div>
          <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
            Browser requirement
          </p>
          <h1
            id="welcome-title"
            class="m-0 max-w-[570px] text-[clamp(27px,4vw,42px)] font-medium leading-[1.1] tracking-[-.055em] text-text"
          >
            Open a folder or archive.
          </h1>
          <p class="state-description mt-3 mb-0 max-w-[510px] text-xs leading-[1.65] text-text-muted">
            Folder selection needs Chromium over HTTPS or localhost. You can open a <code>.c3p</code> archive directly in this browser.
          </p>
          <div class="project-open-actions state-actions mt-[23px] flex shrink-0 flex-wrap items-center gap-[7px]">
            <button
              class="open-project-button state-action mt-0 inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded border border-[#a6c66b] bg-accent px-[14px] text-[11px] font-bold text-[#172115] hover:bg-[#d8f69c] disabled:cursor-not-allowed disabled:border-[#4c5c4a] disabled:bg-[#344033] disabled:text-[#a9b69e]"
              type="button"
              disabled
            >
              Open project folder
            </button>
            <button
              class="open-project-button archive-open-button state-action mt-0 inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded border border-[#52634f] bg-[#17231f] px-[14px] text-[11px] font-bold text-[#d3dfc4] hover:border-[#98b46b] hover:bg-[#25362a] disabled:cursor-not-allowed disabled:border-[#4c5c4a] disabled:bg-[#344033] disabled:text-[#a9b69e]"
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
            class="state-mark mb-[21px] grid size-[50px] place-items-center rounded-[9px_9px_9px_1px] border border-[#8aa557] font-mono text-[15px] font-medium leading-none text-accent"
            aria-hidden="true"
          >
            C3
          </div>
          <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
            Local Construct analysis
          </p>
          <h1
            id="welcome-title"
            class="m-0 max-w-[570px] text-[clamp(27px,4vw,42px)] font-medium leading-[1.1] tracking-[-.055em] text-text"
          >
            See how your project fits together.
          </h1>
          <p class="state-description mt-3 mb-0 max-w-[510px] text-xs leading-[1.65] text-text-muted">
            Choose a Construct 3 folder project or a <code>.c3p</code> archive to index entities, follow references, and review resource issues. Forge never writes to project files.
          </p>
          <div class="project-open-actions state-actions mt-[23px] flex shrink-0 flex-wrap items-center gap-[7px]">
            <button
              class="open-project-button state-action mt-0 inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded border border-[#a6c66b] bg-accent px-[14px] text-[11px] font-bold text-[#172115] hover:bg-[#d8f69c] disabled:cursor-not-allowed disabled:border-[#4c5c4a] disabled:bg-[#344033] disabled:text-[#a9b69e] [&>span]:text-[17px] [&>span]:font-normal [&>span]:leading-[.7]"
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseFolder"
            >
              <span aria-hidden="true">+</span>Open project folder
            </button>
            <button
              class="open-project-button archive-open-button state-action mt-0 inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center gap-[7px] rounded border border-[#52634f] bg-[#17231f] px-[14px] text-[11px] font-bold text-[#d3dfc4] hover:border-[#98b46b] hover:bg-[#25362a] disabled:cursor-not-allowed disabled:border-[#4c5c4a] disabled:bg-[#344033] disabled:text-[#a9b69e] [&>span]:text-[17px] [&>span]:font-normal [&>span]:leading-[.7]"
              type="button"
              :disabled="loading || restoreChecking"
              @click="chooseArchive"
            >
              <span aria-hidden="true">▣</span>Open .c3p archive
            </button>
          </div>
          <p class="state-footnote mt-3 mb-0 text-[10px] text-text-dim">
            Select a folder containing <code>project.c3proj</code>
          </p>
        </template>
      </section>

      <footer class="app-footer flex min-h-[31px] items-center justify-between gap-[14px] border-t border-line-soft px-5 text-[10px] text-text-dim max-[420px]:px-[11px]">
        <span>Construct 3 project analyzer</span>
        <span>Read-only by design</span>
      </footer>
    </main>
  </div>
</template>
