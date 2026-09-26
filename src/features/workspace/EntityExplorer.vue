<script setup lang="ts">
import { computed } from 'vue'
import type { EntityKind, ForgeEntity, ProjectAnalysis } from '../../core/types'
import { entityKindPluralLabel } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

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
    label: entityKindPluralLabel[kind],
    entities: props.analysis.index.byKind.get(kind) ?? [],
  })).filter((kindGroup) => kindGroup.entities.length > 0),
})).filter((group) => group.kinds.length > 0))

function entityLabel(entity: ForgeEntity): string {
  return entity.name || entity.sourcePath
}
</script>

<template>
  <nav
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
      <section
        v-for="group in groups"
        :key="group.label"
        class="explorer-group"
      >
        <h3>{{ group.label }}</h3>
        <div
          v-for="kindGroup in group.kinds"
          :key="kindGroup.kind"
          class="entity-kind-group"
        >
          <p class="entity-kind-heading">
            <span>{{ kindGroup.label }}</span>
            <span>{{ kindGroup.entities.length }}</span>
          </p>
          <ul class="entity-list">
            <li
              v-for="entity in kindGroup.entities"
              :key="entity.id"
            >
              <button
                class="entity-link"
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
                  <span class="entity-link-name">{{ entityLabel(entity) }}</span>
                  <span class="entity-link-path">{{ entity.sourcePath }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </nav>
</template>
