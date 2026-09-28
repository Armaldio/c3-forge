<script setup lang="ts">
import { computed } from 'vue'
import type { EntityKind, ProjectAnalysis } from '../../core/types'

const props = defineProps<{
  analysis: ProjectAnalysis
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
  </section>
</template>
