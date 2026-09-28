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
    class="overview-pane"
    aria-labelledby="overview-title"
  >
    <div class="overview-heading">
      <div>
        <p class="eyebrow">
          Project overview
        </p>
        <h1 id="overview-title">
          {{ analysis.manifest.name }}
        </h1>
        <p class="project-version">
          <span>Construct</span>
          <code>{{ analysis.manifest.constructVersion || 'Version not recorded' }}</code>
        </p>
      </div>
      <span class="read-only-mark"><span aria-hidden="true">◉</span> Local · read-only</span>
    </div>

    <dl class="overview-facts">
      <div
        v-for="fact in facts"
        :key="fact.label"
        class="overview-fact"
      >
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value.toLocaleString() }}</dd>
      </div>
    </dl>

    <section
      class="overview-start"
      aria-labelledby="overview-start-title"
    >
      <div class="overview-start-heading">
        <div>
          <p class="eyebrow">
            Project map
          </p>
          <h2 id="overview-start-title">
            Start exploring
          </h2>
        </div>
        <span class="overview-start-readonly">Read-only · local</span>
      </div>

      <div class="overview-structure">
        <h3>Project structure</h3>
        <dl>
          <div
            v-for="item in structureSummary"
            :key="item.label"
          >
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value.toLocaleString() }}</dd>
          </div>
        </dl>
      </div>

      <nav
        class="overview-actions"
        aria-label="Project exploration"
      >
        <button
          type="button"
          :disabled="!hasObjects"
          @click="emit('explore-kind', 'object')"
        >
          <span>Explore objects</span><span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          :disabled="!hasEventSheets"
          @click="emit('explore-kind', 'eventSheet')"
        >
          <span>Explore event sheets</span><span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          @click="emit('navigate-view', 'graph')"
        >
          <span>Open relationship graph</span><span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          @click="emit('navigate-view', 'resources')"
        >
          <span>Browse resources</span><span aria-hidden="true">→</span>
        </button>
      </nav>
    </section>
  </section>
</template>
