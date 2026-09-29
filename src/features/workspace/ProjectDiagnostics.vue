<script setup lang="ts">
import { computed } from 'vue'
import type { DiagnosticSeverity, ProjectAnalysis } from '../../core/types'
import { summarizeProjectDiagnostics } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
}>()

const emit = defineEmits<{
  close: []
}>()

const severityOrder: readonly DiagnosticSeverity[] = ['error', 'warning', 'info']
const summary = computed(() => summarizeProjectDiagnostics(props.analysis.diagnostics))
const severityRows = computed(() => severityOrder.map((severity) => ({
  severity,
  count: summary.value.counts[severity],
})))
const findings = computed(() => props.analysis.diagnostics)
const hasFindings = computed(() => summary.value.total > 0)
</script>

<template>
  <aside
    class="diagnostics-pane min-w-0 bg-[#111a23] pb-3"
    aria-labelledby="diagnostics-title"
  >
    <div class="pane-heading flex min-h-12 items-center justify-between border-b border-line-soft px-[13px] py-[10px]">
      <div>
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          Project report
        </p>
        <h2
          id="diagnostics-title"
          class="m-0 text-[13px] font-semibold text-text"
        >
          Diagnostics
        </h2>
      </div>
      <span class="count-chip inline-flex min-h-[19px] min-w-[22px] items-center justify-center rounded-[10px] border border-[#33434e] px-[5px] py-px text-[11px] font-semibold text-text-muted">{{ summary.total }}</span>
      <button
        class="ml-auto size-7 cursor-pointer rounded border border-transparent bg-transparent text-xl leading-none text-text-muted hover:border-line hover:text-text"
        type="button"
        aria-label="Close diagnostics"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <ul
      class="severity-summary m-0 flex list-none border-b border-line-soft px-3 py-[9px]"
      aria-label="Diagnostic counts by severity"
    >
      <li
        v-for="(item, index) in severityRows"
        :key="item.severity"
        :data-severity="item.severity"
        class="flex min-w-0 flex-1 items-center gap-[5px] text-[11px] capitalize text-text-dim"
        :class="{ 'border-l border-line-soft pl-2': index > 0 }"
      >
        <span
          class="severity-dot size-[5px] shrink-0 rounded-full bg-info"
          :class="{
            'bg-error': item.severity === 'error',
            'bg-warning': item.severity === 'warning',
            'bg-info': item.severity === 'info',
          }"
          aria-hidden="true"
        />
        <span>{{ item.severity }}</span>
        <strong class="ml-auto text-xs font-semibold text-text-muted">{{ item.count }}</strong>
      </li>
    </ul>

    <p
      v-if="!hasFindings"
      class="diagnostics-clear mx-3 my-[13px] flex items-center gap-2 text-xs text-[#aab89b]"
    >
      <span
        class="clear-mark grid size-[17px] place-items-center rounded-full border border-[#53694a] text-[11px] text-accent"
        aria-hidden="true"
      >✓</span>
      No issues detected.
    </p>

    <section
      v-if="findings.length"
      class="finding-section px-3 pt-3 max-[760px]:p-3"
      aria-labelledby="findings-title"
    >
      <h3
        id="findings-title"
        class="mb-[5px] text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim"
      >
        Findings
      </h3>
      <ol class="finding-list m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] gap-x-5 p-0 max-[760px]:block">
        <li
          v-for="(diagnostic, index) in findings"
          :key="`${diagnostic.ruleId}:${diagnostic.sourcePath ?? diagnostic.entityId ?? 'project'}:${index}`"
          class="finding border-t border-line-soft py-[9px] pb-[10px]"
          :data-severity="diagnostic.severity"
        >
          <div class="finding-topline flex items-center justify-between gap-2">
            <span
              class="severity-label text-[10px] font-semibold uppercase text-info"
              :class="{
                'text-error': diagnostic.severity === 'error',
                'text-warning': diagnostic.severity === 'warning',
                'text-info': diagnostic.severity === 'info',
              }"
            >{{ diagnostic.severity }}</span>
            <code class="truncate text-[10px] text-text-dim">{{ diagnostic.ruleId }}</code>
          </div>
          <h4 class="mt-1 mb-0.5 break-words text-xs font-semibold text-text">
            {{ diagnostic.title }}
          </h4>
          <p class="m-0 break-words text-[11px] leading-[1.5] text-text-muted">
            {{ diagnostic.description }}
          </p>
          <code
            v-if="diagnostic.sourcePath"
            class="finding-path mt-[5px] block truncate text-[10px] text-[#94a4af]"
          >{{ diagnostic.sourcePath }}</code>
          <code
            v-if="diagnostic.evidence"
            class="finding-evidence mt-[5px] block truncate border-l-2 border-[#5a674b] bg-[#172119] px-[6px] py-1 text-[10px] text-[#b6c39f]"
          >{{ diagnostic.evidence }}</code>
        </li>
      </ol>
    </section>
  </aside>
</template>
