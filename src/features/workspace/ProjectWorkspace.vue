<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectLoadStage } from '../../core/types'
import EntityExplorer from './EntityExplorer.vue'
import EntityInspector from './EntityInspector.vue'
import GlobalSearch from './GlobalSearch.vue'
import ProjectDiagnostics from './ProjectDiagnostics.vue'
import ProjectOverview from './ProjectOverview.vue'
import { loadStageLabel, summarizeProjectDiagnostics } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis | null
  selectedEntityId: string | null
  searchQuery: string
  searchResults: readonly ForgeEntity[]
  loading: boolean
  loadingStage: ProjectLoadStage | null
  error: string | null
  browserSupported: boolean
}>()

const emit = defineEmits<{
  'open-project': []
  'open-archive': [file: File]
  'update:searchQuery': [value: string]
  'select-entity': [id: string]
  'clear-project': []
}>()

const loadingLabel = computed(() => props.loadingStage ? loadStageLabel[props.loadingStage] : 'Preparing project')
const archiveInput = ref<HTMLInputElement | null>(null)
const projectMenu = ref<HTMLDetailsElement | null>(null)
const diagnosticsToggle = ref<HTMLButtonElement | null>(null)
const diagnosticsOpen = ref(false)
const diagnosticSummary = computed(() => summarizeProjectDiagnostics(props.analysis?.diagnostics ?? []))
const diagnosticMark = computed(() => {
  if (diagnosticSummary.value.state === 'clear') return '✓'
  if (diagnosticSummary.value.state === 'info') return 'i'
  return '!'
})

function closeProjectMenu(): void {
  if (projectMenu.value) projectMenu.value.open = false
}

function chooseFolder(): void {
  closeProjectMenu()
  emit('open-project')
}

function chooseArchive(): void {
  closeProjectMenu()
  archiveInput.value?.click()
}

function toggleDiagnostics(): void {
  diagnosticsOpen.value = !diagnosticsOpen.value
}

function closeDiagnostics(): void {
  diagnosticsOpen.value = false
  void nextTick(() => diagnosticsToggle.value?.focus())
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
          @select="emit('select-entity', $event)"
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
              :disabled="loading || !browserSupported"
              @click="chooseFolder"
            >
              Open folder project
            </button>
            <button
              type="button"
              :disabled="loading"
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
          class="text-button"
          type="button"
          :disabled="loading"
          @click="chooseArchive"
        >
          Open .c3p archive
        </button>
      </div>

      <template v-if="analysis">
        <section
          class="workspace-layout"
          aria-label="Project workspace"
        >
          <EntityExplorer
            :analysis="analysis"
            :selected-entity-id="selectedEntityId"
            @select="emit('select-entity', $event)"
          />
          <div class="main-column">
            <ProjectOverview :analysis="analysis" />
            <EntityInspector
              :analysis="analysis"
              :selected-entity-id="selectedEntityId"
              @select="emit('select-entity', $event)"
            />
          </div>
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
              :disabled="loading"
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
              :disabled="loading"
              @click="chooseFolder"
            >
              <span aria-hidden="true">+</span>Open project folder
            </button>
            <button
              class="open-project-button archive-open-button state-action"
              type="button"
              :disabled="loading"
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
