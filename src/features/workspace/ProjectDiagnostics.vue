<script setup lang="ts">
import { computed } from 'vue'
import type { DiagnosticSeverity, ProjectAnalysis } from '../../core/types'

const props = defineProps<{
  analysis: ProjectAnalysis
}>()

const emit = defineEmits<{
  close: []
}>()

const severityOrder: readonly DiagnosticSeverity[] = ['error', 'warning', 'info']
const summary = computed(() => severityOrder.map((severity) => ({
  severity,
  count: props.analysis.stats.diagnosticsBySeverity[severity] ?? 0,
})))
const findings = computed(() => props.analysis.diagnostics)
const findingCount = computed(() => findings.value.length)
const hasFindings = computed(() => findingCount.value > 0)
</script>

<template>
  <aside
    class="diagnostics-pane"
    aria-labelledby="diagnostics-title"
  >
    <div class="pane-heading">
      <div>
        <p class="eyebrow">
          Project report
        </p>
        <h2 id="diagnostics-title">
          Diagnostics
        </h2>
      </div>
      <span class="count-chip">{{ findingCount }}</span>
      <button
        class="diagnostics-close"
        type="button"
        aria-label="Close diagnostics"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <ul
      class="severity-summary"
      aria-label="Diagnostic counts by severity"
    >
      <li
        v-for="item in summary"
        :key="item.severity"
        :data-severity="item.severity"
      >
        <span
          class="severity-dot"
          aria-hidden="true"
        />
        <span>{{ item.severity }}</span>
        <strong>{{ item.count }}</strong>
      </li>
    </ul>

    <p
      v-if="!hasFindings"
      class="diagnostics-clear"
    >
      <span
        class="clear-mark"
        aria-hidden="true"
      >✓</span>
      No project issues detected.
    </p>

    <section
      v-if="findings.length"
      class="finding-section"
      aria-labelledby="findings-title"
    >
      <h3 id="findings-title">
        Findings
      </h3>
      <ol class="finding-list">
        <li
          v-for="(diagnostic, index) in findings"
          :key="`${diagnostic.ruleId}:${diagnostic.sourcePath ?? diagnostic.entityId ?? 'project'}:${index}`"
          class="finding"
          :data-severity="diagnostic.severity"
        >
          <div class="finding-topline">
            <span class="severity-label">{{ diagnostic.severity }}</span>
            <code>{{ diagnostic.ruleId }}</code>
          </div>
          <h4>{{ diagnostic.title }}</h4>
          <p>{{ diagnostic.description }}</p>
          <code
            v-if="diagnostic.sourcePath"
            class="finding-path"
          >{{ diagnostic.sourcePath }}</code>
          <code
            v-if="diagnostic.evidence"
            class="finding-evidence"
          >{{ diagnostic.evidence }}</code>
        </li>
      </ol>
    </section>
  </aside>
</template>
