<script setup lang="ts">
import { computed } from 'vue'
import type { ForgeEntity } from '../../core/types'
import { entityKindLabel } from './presentation'

const MAX_VISIBLE_RESULTS = 100

const props = defineProps<{
  query: string
  results: readonly ForgeEntity[]
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  select: [id: string]
}>()

const visibleResults = computed(() => props.results.slice(0, MAX_VISIBLE_RESULTS))
const resultSummary = computed(() => {
  const count = props.results.length
  if (count === 0) return 'No matching entities'

  const plural = count === 1 ? 'entity' : 'entities'
  return count > MAX_VISIBLE_RESULTS
    ? `Showing the first ${MAX_VISIBLE_RESULTS} of ${count} matching ${plural}`
    : `${count} matching ${plural}`
})
</script>

<template>
  <div class="global-search">
    <label
      class="sr-only"
      for="entity-search"
    >Search project entities</label>
    <span
      aria-hidden="true"
      class="search-mark"
    >⌕</span>
    <input
      id="entity-search"
      name="project-entities"
      :value="query"
      type="search"
      autocomplete="off"
      placeholder="Search objects, sheets, layouts…"
      aria-describedby="search-hint"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    >
    <span
      id="search-hint"
      class="search-hint"
    >Search</span>

    <div
      v-if="query.trim()"
      class="search-results"
      aria-live="polite"
    >
      <p class="search-results-label">
        {{ resultSummary }}
      </p>
      <ul
        v-if="results.length"
        class="search-result-list"
      >
        <li
          v-for="entity in visibleResults"
          :key="entity.id"
        >
          <button
            class="search-result"
            type="button"
            @click="emit('select', entity.id)"
          >
            <span class="search-result-main">
              <span class="search-result-name">{{ entity.name }}</span>
              <span class="search-result-kind">{{ entityKindLabel[entity.kind] }}</span>
            </span>
            <span class="search-result-path">{{ entity.sourcePath }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
