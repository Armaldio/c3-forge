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
    class="explorer-pane"
    aria-labelledby="explorer-title"
  >
    <div class="pane-heading">
      <div>
        <p class="eyebrow">
          Project map
        </p>
        <h2 id="explorer-title">
          Explorer
        </h2>
      </div>
      <span class="count-chip">{{ visibleEntityCount }}</span>
    </div>

    <p
      v-if="groups.length === 0"
      class="quiet-empty"
    >
      No entities were indexed in this project.
    </p>

    <div
      v-else
      class="explorer-groups"
    >
      <details
        v-for="group in groups"
        :key="group.kind"
        class="explorer-group"
        :data-entity-kind="group.kind"
        :open="group.kind === 'object'"
      >
        <summary class="explorer-group-heading">
          <span>{{ group.label }}</span>
          <span class="explorer-group-count">{{ group.entities.length }}</span>
        </summary>
        <ul class="entity-list">
          <li
            v-for="entity in group.entities"
            :key="entity.id"
          >
            <button
              class="entity-link"
              :data-entity-id="entity.id"
              :class="{ 'is-selected': selectedEntityId === entity.id }"
              type="button"
              :aria-pressed="selectedEntityId === entity.id"
              @click="emit('select', entity.id)"
            >
              <span
                class="entity-kind-dot"
                :data-kind="entity.kind"
                aria-hidden="true"
              />
              <span class="entity-link-copy">
                <span
                  class="entity-link-name"
                  :title="entityLabel(entity)"
                >{{ entityLabel(entity) }}</span>
                <span class="entity-link-path">{{ entity.sourcePath }}</span>
              </span>
            </button>
          </li>
        </ul>
      </details>
    </div>
  </nav>
</template>
