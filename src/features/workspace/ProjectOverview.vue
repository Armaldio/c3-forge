<script setup lang="ts">
import { computed } from 'vue'
import type { EntityKind, ProjectAnalysis } from '../../core/types'

const props = defineProps<{
  analysis: ProjectAnalysis
}>()

const emit = defineEmits<{
  'explore-kind': [kind: 'object' | 'eventSheet']
  'navigate-view': [view: 'graph' | 'resources']
}>()

const facts = computed(() => {
  const counts = props.analysis.stats.entitiesByKind
  const count = (kind: EntityKind) => counts[kind] ?? 0

  return [
    { label: 'Layouts', value: count('layout') },
    { label: 'Event sheets', value: count('eventSheet') },
    { label: 'Objects', value: count('object') },
    { label: 'Families', value: count('family') },
    { label: 'Functions', value: count('function') },
    { label: 'Variables', value: count('variable') },
    { label: 'Timelines', value: count('timeline') },
    { label: 'Flowcharts', value: count('flowchart') },
  ]
})

const hasObjects = computed(() => (props.analysis.stats.entitiesByKind.object ?? 0) > 0)
const hasEventSheets = computed(() => (props.analysis.stats.entitiesByKind.eventSheet ?? 0) > 0)

const structureSummary = computed(() => {
  const relationships = props.analysis.dependencies
  return [
    { label: 'Placed object types', value: relationships.filter((edge) => edge.relationship === 'layout-instance-type').length },
    { label: 'Event-sheet links', value: relationships.filter((edge) => edge.relationship === 'event-sheet-include').length },
    { label: 'Function links', value: relationships.filter((edge) => edge.relationship === 'function-call').length },
  ]
})
</script>

<template>
  <section
    class="overview-pane border-b border-line bg-[#111a23] px-[22px] pt-[18px] pb-4 max-[760px]:px-[14px] max-[760px]:pt-4 max-[760px]:pb-[14px]"
    aria-labelledby="overview-title"
  >
    <div class="overview-heading flex items-start justify-between gap-4">
      <div>
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          Project overview
        </p>
        <h1
          id="overview-title"
          class="m-0 max-w-full break-words text-[clamp(20px,2vw,26px)] font-semibold leading-[1.2] tracking-[-.045em] text-text max-[420px]:text-[21px]"
        >
          {{ analysis.manifest.name }}
        </h1>
        <p class="project-version mt-[7px] mb-0 flex items-center gap-2 text-[11px] text-text-dim">
          <span>Construct</span>
          <code class="text-[10px] text-text-muted">{{ analysis.manifest.constructVersion || 'Version not recorded' }}</code>
        </p>
      </div>
      <span class="read-only-mark mt-[5px] inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[3px] border border-[#39454a] px-[7px] py-1 text-[10px] font-medium text-[#b2c59c] max-[420px]:hidden"><span
        class="text-[10px] text-accent"
        aria-hidden="true"
      >◉</span> Local · read-only</span>
    </div>

    <dl class="overview-facts m-0 mt-[17px] grid grid-cols-4 border-y border-line max-[1120px]:grid-cols-3 max-[420px]:grid-cols-2">
      <div
        v-for="(fact, index) in facts"
        :key="fact.label"
        class="overview-fact min-w-0 pt-[9px] pr-[10px] pb-2"
        :class="[
          index % 4 !== 0 ? 'pl-[11px] border-l border-line-soft' : '',
          index % 3 === 0 ? 'max-[1120px]:pl-0 max-[1120px]:border-l-0' : 'max-[1120px]:pl-[11px] max-[1120px]:border-l max-[1120px]:border-line-soft',
          index >= 3 ? 'max-[1120px]:border-t max-[1120px]:border-line-soft' : '',
          index % 2 === 0 ? 'max-[420px]:pl-0 max-[420px]:border-l-0' : 'max-[420px]:pl-[11px] max-[420px]:border-l max-[420px]:border-line-soft',
          index >= 2 ? 'max-[420px]:border-t max-[420px]:border-line-soft' : '',
        ]"
      >
        <dt class="truncate text-[11px] text-text-dim">
          {{ fact.label }}
        </dt>
        <dd class="mt-0.5 mb-0 text-[15px] font-semibold leading-[1.3] text-text">
          {{ fact.value.toLocaleString() }}
        </dd>
      </div>
    </dl>

    <section
      class="overview-start grid grid-cols-[minmax(0,1.3fr)_minmax(220px,.7fr)] gap-x-8 gap-y-5 pt-[19px] max-[420px]:grid-cols-1 max-[420px]:gap-[15px]"
      aria-labelledby="overview-start-title"
    >
      <div class="overview-start-heading col-span-full flex items-end justify-between gap-3 max-[420px]:col-auto">
        <div>
          <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
            Project map
          </p>
          <h2
            id="overview-start-title"
            class="m-0 text-base font-semibold text-text"
          >
            Start exploring
          </h2>
        </div>
        <span class="overview-start-readonly text-[11px] text-text-dim">Read-only · local</span>
      </div>

      <div class="overview-structure">
        <h3 class="mt-0 mb-2 text-[11px] font-semibold uppercase tracking-[.035em] text-text-muted">
          Project structure
        </h3>
        <dl class="m-0 grid grid-cols-3 gap-2">
          <div
            v-for="item in structureSummary"
            :key="item.label"
            class="flex flex-col-reverse gap-[3px] border border-line-soft bg-[#0e171e] px-[9px] py-2"
          >
            <dt class="text-[10px] text-text-dim">
              {{ item.label }}
            </dt>
            <dd class="m-0 text-sm font-semibold text-text">
              {{ item.value.toLocaleString() }}
            </dd>
          </div>
        </dl>
      </div>

      <nav
        class="overview-actions grid grid-cols-2 gap-[7px] max-[420px]:grid-cols-1"
        aria-label="Project exploration"
      >
        <button
          class="flex min-h-[38px] cursor-pointer items-center justify-between gap-2 border border-[#344550] bg-[#16232d] px-[9px] py-[7px] text-left text-[11px] text-text hover:border-accent hover:bg-[#1c2a31] focus-visible:border-accent disabled:cursor-not-allowed disabled:text-text-dim disabled:opacity-[.55]"
          type="button"
          :disabled="!hasObjects"
          @click="emit('explore-kind', 'object')"
        >
          <span>Explore objects</span><span
            class="text-accent"
            aria-hidden="true"
          >→</span>
        </button>
        <button
          class="flex min-h-[38px] cursor-pointer items-center justify-between gap-2 border border-[#344550] bg-[#16232d] px-[9px] py-[7px] text-left text-[11px] text-text hover:border-accent hover:bg-[#1c2a31] focus-visible:border-accent disabled:cursor-not-allowed disabled:text-text-dim disabled:opacity-[.55]"
          type="button"
          :disabled="!hasEventSheets"
          @click="emit('explore-kind', 'eventSheet')"
        >
          <span>Explore event sheets</span><span
            class="text-accent"
            aria-hidden="true"
          >→</span>
        </button>
        <button
          class="flex min-h-[38px] cursor-pointer items-center justify-between gap-2 border border-[#344550] bg-[#16232d] px-[9px] py-[7px] text-left text-[11px] text-text hover:border-accent hover:bg-[#1c2a31] focus-visible:border-accent disabled:cursor-not-allowed disabled:text-text-dim disabled:opacity-[.55]"
          type="button"
          @click="emit('navigate-view', 'graph')"
        >
          <span>Open relationship graph</span><span
            class="text-accent"
            aria-hidden="true"
          >→</span>
        </button>
        <button
          class="flex min-h-[38px] cursor-pointer items-center justify-between gap-2 border border-[#344550] bg-[#16232d] px-[9px] py-[7px] text-left text-[11px] text-text hover:border-accent hover:bg-[#1c2a31] focus-visible:border-accent disabled:cursor-not-allowed disabled:text-text-dim disabled:opacity-[.55]"
          type="button"
          @click="emit('navigate-view', 'resources')"
        >
          <span>Browse resources</span><span
            class="text-accent"
            aria-hidden="true"
          >→</span>
        </button>
      </nav>
    </section>
  </section>
</template>
