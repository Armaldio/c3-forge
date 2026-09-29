<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { EntityKind, ForgeEntity, ProjectAnalysis } from '../../core/types'
import { entityKindPluralLabel } from './presentation'
import { buildExplorerSections } from './explorer-model'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const explorerRoot = ref<HTMLElement | null>(null)

const groups = computed(() => buildExplorerSections(props.analysis.index.byKind, entityKindPluralLabel))
const visibleEntityCount = computed(() => groups.value.reduce((total, group) => total + group.entities.length, 0))

const entityKindDotClasses: Readonly<Record<EntityKind, string>> = {
  object: 'border-[#e7a968] bg-[#8b6847]',
  family: 'border-[#d48fa4] bg-[#8e6271]',
  layout: 'border-[#82c4bd] bg-[#4a827f]',
  eventSheet: 'border-[#9aabe4] bg-[#586995]',
  function: 'border-accent bg-[#77934f]',
  variable: 'border-[#e9cb71] bg-[#94834e]',
  timeline: 'border-[#9dc4ef] bg-[#526d8c]',
  flowchart: 'border-[#d2a9ed] bg-[#795994]',
  addon: 'border-[#899aa7] bg-[#536472]',
  asset: 'border-[#899aa7] bg-[#536472]',
  layoutLayer: 'border-[#899aa7] bg-[#536472]',
  layoutInstance: 'border-[#899aa7] bg-[#536472]',
  event: 'border-[#899aa7] bg-[#536472]',
  behavior: 'border-[#899aa7] bg-[#536472]',
  animation: 'border-[#899aa7] bg-[#536472]',
  animationFrame: 'border-[#899aa7] bg-[#536472]',
  projectFolder: 'border-[#899aa7] bg-[#536472]',
  projectFile: 'border-[#899aa7] bg-[#536472]',
}

watch(() => props.selectedEntityId, async (selectedId) => {
  if (!selectedId) return
  await nextTick()
  if (props.selectedEntityId !== selectedId) return

  const root = explorerRoot.value
  const selectedButton = [...(root?.querySelectorAll<HTMLElement>('[data-entity-id]') ?? [])]
    .find((button) => button.dataset.entityId === selectedId)
  if (!root || !selectedButton) return

  const groupSection = selectedButton.closest<HTMLDetailsElement>('details[data-entity-kind]')
  if (groupSection && !groupSection.open) groupSection.open = true

  await nextTick()
  if (props.selectedEntityId !== selectedId || !selectedButton.isConnected) return
  if (isVisibleInExplorer(root, selectedButton)) return

  selectedButton.scrollIntoView({ block: 'nearest' })
}, { immediate: true })

function isVisibleInExplorer(root: HTMLElement, entity: HTMLElement): boolean {
  const rootBounds = root.getBoundingClientRect()
  const entityBounds = entity.getBoundingClientRect()
  const headerBounds = root.querySelector<HTMLElement>('.pane-heading')?.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const visibleLeft = Math.max(rootBounds.left, 0)
  const visibleRight = Math.min(rootBounds.right, viewportWidth)
  const visibleTop = Math.max(rootBounds.top, headerBounds?.bottom ?? rootBounds.top, 0)
  const visibleBottom = Math.min(rootBounds.bottom, viewportHeight)

  return entityBounds.left >= visibleLeft
    && entityBounds.right <= visibleRight
    && entityBounds.top >= visibleTop
    && entityBounds.bottom <= visibleBottom
}

function entityLabel(entity: ForgeEntity): string {
  return entity.name || entity.sourcePath
}

async function revealKind(kind: EntityKind): Promise<void> {
  const section = [...(explorerRoot.value?.querySelectorAll<HTMLDetailsElement>('details[data-entity-kind]') ?? [])]
    .find((candidate) => candidate.dataset.entityKind === kind)
  if (!section) return
  section.open = true
  await nextTick()
  const firstEntity = section.querySelector<HTMLElement>('[data-entity-id]')
  if (firstEntity && !isVisibleInExplorer(explorerRoot.value as HTMLElement, firstEntity)) {
    firstEntity.scrollIntoView({ block: 'nearest' })
  }
}

defineExpose({ revealKind })
</script>

<template>
  <nav
    ref="explorerRoot"
    class="explorer-pane min-w-0 overflow-auto border-r border-line bg-[#101922] max-[760px]:sticky max-[760px]:top-0 max-[760px]:z-[1] max-[760px]:max-h-[38vh] max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:border-line"
    aria-labelledby="explorer-title"
  >
    <div class="pane-heading flex min-h-[58px] items-center justify-between border-b border-line-soft bg-[#101922] px-[13px] py-[10px] max-[760px]:sticky max-[760px]:top-0 max-[760px]:z-[1]">
      <div>
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          Project map
        </p>
        <h2
          id="explorer-title"
          class="m-0 text-[13px] font-semibold text-text"
        >
          Explorer
        </h2>
      </div>
      <span class="count-chip inline-flex min-h-[19px] min-w-[22px] items-center justify-center rounded-[10px] border border-[#33434e] px-[5px] py-px text-[11px] font-semibold text-text-muted">{{ visibleEntityCount }}</span>
    </div>

    <p
      v-if="groups.length === 0"
      class="quiet-empty px-[13px] py-[15px] text-[11px] text-text-dim"
    >
      No entities were indexed in this project.
    </p>

    <div
      v-else
      class="explorer-groups py-[6px] pb-4"
    >
      <details
        v-for="group in groups"
        :key="group.kind"
        class="explorer-group border-b border-line-soft"
        :data-entity-kind="group.kind"
        :open="group.kind === 'object'"
      >
        <summary class="explorer-group-heading group flex min-h-[39px] cursor-pointer list-none items-center justify-between gap-2 px-[13px] py-[7px] text-xs font-semibold text-text hover:bg-[#17232d] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <span class="mr-auto w-[10px] shrink-0 text-[17px] leading-none text-text-dim transition-transform duration-[120ms] group-open:rotate-90">›</span>
          <span>{{ group.label }}</span>
          <span class="explorer-group-count ml-auto text-[11px] text-text-muted">{{ group.entities.length }}</span>
        </summary>
        <ul class="entity-list m-0 list-none p-0">
          <li
            v-for="entity in group.entities"
            :key="entity.id"
          >
            <button
              class="entity-link group flex min-h-[31px] w-full cursor-pointer items-center gap-2 border-0 border-l-2 border-transparent bg-transparent py-[5px] pr-3 pl-[15px] text-left hover:bg-[#17232d] focus-visible:outline-2 focus-visible:outline-accent"
              :data-entity-id="entity.id"
              :class="{ 'is-selected border-l-accent bg-[#1c2a31]': selectedEntityId === entity.id }"
              type="button"
              :aria-pressed="selectedEntityId === entity.id"
              @click="emit('select', entity.id)"
            >
              <span
                class="entity-kind-dot size-[7px] shrink-0 rounded-[2px] border bg-[#536472]"
                :data-kind="entity.kind"
                :class="entityKindDotClasses[entity.kind]"
                aria-hidden="true"
              />
              <span class="entity-link-copy min-w-0 flex-1">
                <span
                  class="entity-link-name block truncate text-xs font-medium text-text"
                  :title="entityLabel(entity)"
                >{{ entityLabel(entity) }}</span>
                <span
                  class="entity-link-path block max-h-0 overflow-hidden font-mono text-[10px] leading-[1.45] text-text-dim opacity-0 transition-[opacity,max-height] duration-[120ms] group-hover:mt-0.5 group-hover:max-h-[22px] group-hover:opacity-100 group-focus-visible:mt-0.5 group-focus-visible:max-h-[22px] group-focus-visible:opacity-100"
                  :class="{ 'mt-0.5 max-h-[22px] opacity-100': selectedEntityId === entity.id }"
                >{{ entity.sourcePath }}</span>
              </span>
            </button>
          </li>
        </ul>
      </details>
    </div>
  </nav>
</template>
