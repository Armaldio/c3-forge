<script setup lang="ts">
import { computed } from 'vue'
import type { DiagnosticSeverity, ProjectAnalysis } from '../../core/types'

const props = defineProps<{
  analysis: ProjectAnalysis
}>()

const severityOrder: readonly DiagnosticSeverity[] = ['error', 'warning', 'info']
const summary = computed(() => severityOrder.map((severity) => ({
  severity,
  count: props.analysis.stats.diagnosticsBySeverity[severity] ?? 0,
})))
const nonResourceDiagnostics = computed(() => props.analysis.diagnostics.filter((diagnostic) => !diagnostic.ruleId.startsWith('resource.')))
const findingCount = computed(() => nonResourceDiagnostics.value.length + props.analysis.resourceIssues.length)
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
          Project health
        </p>
        <h2 id="diagnostics-title">
          Diagnostics
        </h2>
      </div>
      <span class="count-chip">{{ findingCount }}</span>
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
      v-if="nonResourceDiagnostics.length"
      class="finding-section"
      aria-labelledby="rules-title"
    >
      <h3 id="rules-title">
        Checks
      </h3>
      <ol class="finding-list">
        <li
          v-for="(diagnostic, index) in nonResourceDiagnostics"
          :key="`${diagnostic.ruleId}:${diagnostic.sourcePath ?? diagnostic.entityId ?? index}`"
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

    <section
      v-if="analysis.resourceIssues.length"
      class="finding-section resource-section"
      aria-labelledby="resource-issues-title"
    >
      <h3 id="resource-issues-title">
        Resource issues
      </h3>
      <ol class="finding-list">
        <li
          v-for="issue in analysis.resourceIssues"
          :key="`${issue.stage}:${issue.code}:${issue.path}`"
          class="finding resource-finding"
        >
          <div class="finding-topline">
            <span class="severity-label">{{ issue.stage }}</span>
            <code>{{ issue.code }}</code>
          </div>
          <h4>{{ issue.path }}</h4>
          <p>{{ issue.message }}</p>
        </li>
      </ol>
    </section>
  </aside>
</template>
