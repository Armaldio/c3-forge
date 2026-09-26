<script setup lang="ts">
import { computed } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectLoadStage } from '../../core/types'
import EntityExplorer from './EntityExplorer.vue'
import EntityInspector from './EntityInspector.vue'
import GlobalSearch from './GlobalSearch.vue'
import ProjectDiagnostics from './ProjectDiagnostics.vue'
import ProjectOverview from './ProjectOverview.vue'
import { loadStageLabel } from './presentation'

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
  'update:searchQuery': [value: string]
  'select-entity': [id: string]
  'clear-project': []
}>()

const projectActionLabel = computed(() => props.analysis ? 'Open another folder' : 'Open project folder')
const loadingLabel = computed(() => props.loadingStage ? loadStageLabel[props.loadingStage] : 'Preparing project')
</script>

<template>
  <div class="forge-shell">
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
        <button
          class="open-project-button"
          type="button"
          :aria-label="projectActionLabel"
          :disabled="loading"
          @click="emit('open-project')"
        >
          <span aria-hidden="true">+</span>{{ projectActionLabel }}
        </button>
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
          @click="emit('open-project')"
        >
          Try another folder
        </button>
      </div>

      <section
        v-if="analysis"
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
        <ProjectDiagnostics :analysis="analysis" />
      </section>

      <section
        v-else-if="browserSupported && loading"
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
          Reading a project folder
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
            Folder access needs Chromium.
          </h1>
          <p class="state-description">
            C3 Forge reads Construct projects through the browser’s local folder picker. Open this app in Chromium over HTTPS or localhost to continue.
          </p>
          <button
            class="open-project-button state-action"
            type="button"
            disabled
          >
            Open project folder
          </button>
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
            Choose a Construct 3 folder project to index its entities, follow references, and review resource issues. Forge never writes to project files.
          </p>
          <button
            class="open-project-button state-action"
            type="button"
            :disabled="loading"
            @click="emit('open-project')"
          >
            <span aria-hidden="true">+</span>Open project folder
          </button>
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
