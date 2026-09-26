<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { EntityKind, ForgeEntity, ProjectAnalysis } from '../../core/types'
import { entityKindPluralLabel } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const explorerRoot = ref<HTMLElement | null>(null)

const kindGroups: readonly { label: string; kinds: readonly EntityKind[] }[] = [
  { label: 'Objects', kinds: ['object', 'family'] },
  { label: 'Scenes', kinds: ['layout', 'eventSheet', 'timeline', 'flowchart'] },
  { label: 'Logic & data', kinds: ['function', 'variable'] },
  { label: 'Project files', kinds: ['addon', 'asset', 'projectFile'] },
]

const groups = computed(() => kindGroups.map((group) => ({
  ...group,
  kinds: group.kinds.map((kind) => ({
    kind,
    label: kind === 'object' ? 'Object types' : entityKindPluralLabel[kind],
    entities: props.analysis.index.byKind.get(kind) ?? [],
  })).filter((kindGroup) => kindGroup.entities.length > 0),
  entityCount: group.kinds.reduce((total, kind) => total + (props.analysis.index.byKind.get(kind)?.length ?? 0), 0),
})).filter((group) => group.kinds.length > 0))

watch(() => props.selectedEntityId, async (selectedId) => {
  if (!selectedId) return
  await nextTick()

  const selectedButton = [...(explorerRoot.value?.querySelectorAll<HTMLElement>('[data-entity-id]') ?? [])]
    .find((button) => button.dataset.entityId === selectedId)
  const kindSection = selectedButton?.closest<HTMLDetailsElement>('details[data-entity-kind]')
  const groupSection = selectedButton?.closest<HTMLDetailsElement>('details[data-explorer-group]')
  if (groupSection) groupSection.open = true
  if (kindSection) kindSection.open = true
}, { immediate: true })

function entityLabel(entity: ForgeEntity): string {
  return entity.name || entity.sourcePath
}
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
      <span class="count-chip">{{ analysis.stats.totalEntities }}</span>
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
        :key="group.label"
        class="explorer-group"
        :data-explorer-group="group.label"
        :open="group.label === 'Objects'"
      >
        <summary class="explorer-group-heading">
          <span>{{ group.label }}</span>
          <span class="explorer-group-count">{{ group.entityCount }}</span>
        </summary>
        <details
          v-for="kindGroup in group.kinds"
          :key="kindGroup.kind"
          class="entity-kind-group"
          :data-entity-kind="kindGroup.kind"
        >
          <summary class="entity-kind-heading">
            <span>{{ kindGroup.label }}</span>
            <span>{{ kindGroup.entities.length }}</span>
          </summary>
          <ul class="entity-list">
            <li
              v-for="entity in kindGroup.entities"
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
      </details>
    </div>
  </nav>
</template>
