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
  <div class="global-search relative flex min-h-[35px] w-full flex-1 items-center rounded-[5px] border border-[#32424f] bg-[#0d151d] focus-within:border-[#91ac64]">
    <label
      class="sr-only"
      for="entity-search"
    >Search project entities</label>
    <span
      aria-hidden="true"
      class="search-mark pl-[11px] font-mono text-[20px] leading-none text-accent"
    >⌕</span>
    <input
      id="entity-search"
      name="project-entities"
      :value="query"
      type="search"
      autocomplete="off"
      class="h-[33px] w-full min-w-0 border-0 bg-transparent px-2 text-xs text-text outline-none placeholder:text-[#71818e] focus-visible:outline-none"
      placeholder="Search objects, sheets, layouts…"
      aria-describedby="search-hint"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    >
    <span
      id="search-hint"
      class="search-hint mr-2 shrink-0 rounded-[3px] border border-[#34434f] px-[5px] py-[2px] text-[10px] text-text-dim max-[760px]:hidden"
    >Search</span>

    <div
      v-if="query.trim()"
      class="search-results absolute top-[calc(100%+7px)] right-0 left-0 max-h-[min(60vh,460px)] overflow-auto rounded-[5px] border border-[#354652] bg-[#15212b] shadow-[0_12px_30px_rgb(0_0_0_/_34%)]"
      aria-live="polite"
    >
      <p class="search-results-label m-0 border-b border-line px-[11px] py-2 text-[10px] font-semibold uppercase tracking-[.04em] text-text-dim">
        {{ resultSummary }}
      </p>
      <ul
        v-if="results.length"
        class="search-result-list m-0 list-none p-0"
      >
        <li
          v-for="entity in visibleResults"
          :key="entity.id"
        >
          <button
            class="search-result block w-full cursor-pointer border-0 border-b border-line-soft bg-transparent px-[11px] py-2 text-left hover:bg-surface-active focus-visible:bg-surface-active"
            type="button"
            @click="emit('select', entity.id)"
          >
            <span class="search-result-main flex items-baseline gap-2">
              <span class="search-result-name truncate font-semibold text-text">{{ entity.name }}</span>
              <span class="search-result-kind text-[10px] text-accent">{{ entityKindLabel[entity.kind] }}</span>
            </span>
            <span class="search-result-path block truncate font-mono text-[10px] leading-[1.45] text-text-dim">{{ entity.sourcePath }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
