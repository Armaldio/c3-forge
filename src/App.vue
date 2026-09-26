<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { ProjectAnalysis, ProjectLoadStage } from './core/types'
import ProjectWorkspace from './features/workspace/ProjectWorkspace.vue'
import { canOpenProjectFolder, openProjectArchive, openProjectFolder, searchProjectEntities } from './application/workspace'

const analysis = shallowRef<ProjectAnalysis | null>(null)
const selectedEntityId = ref<string | null>(null)
const searchQuery = ref('')
const loading = ref(false)
const loadingStage = ref<ProjectLoadStage | null>(null)
const error = ref<string | null>(null)
const browserSupported = canOpenProjectFolder()

const searchResults = computed(() => analysis.value
  ? searchProjectEntities(analysis.value, searchQuery.value)
  : [])

async function handleOpenProject(): Promise<void> {
  if (!browserSupported || loading.value) return

  loading.value = true
  loadingStage.value = null
  error.value = null

  try {
    const nextAnalysis = await openProjectFolder((stage) => {
      loadingStage.value = stage
    })
    if (nextAnalysis) {
      analysis.value = nextAnalysis
      selectedEntityId.value = null
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
    const nextAnalysis = await openProjectArchive(file, (stage) => {
      loadingStage.value = stage
    })
    analysis.value = nextAnalysis
    selectedEntityId.value = null
    searchQuery.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'An unexpected error prevented the project from loading.'
  } finally {
    loading.value = false
    loadingStage.value = null
  }
}

function handleSelectEntity(entityId: string): void {
  if (analysis.value?.index.byId.has(entityId)) selectedEntityId.value = entityId
}

function handleClearProject(): void {
  if (loading.value) return
  analysis.value = null
  selectedEntityId.value = null
  searchQuery.value = ''
  error.value = null
}
</script>

<template>
  <ProjectWorkspace
    :analysis="analysis"
    :selected-entity-id="selectedEntityId"
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
    @clear-project="handleClearProject"
  />
</template>
