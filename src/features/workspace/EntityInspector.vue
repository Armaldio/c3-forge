<script setup lang="ts">
import { computed } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectReference } from '../../core/types'
import { entityKindLabel, formatMetadataValue } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const entity = computed(() => {
  if (!props.selectedEntityId) return undefined
  return props.analysis.index.byId.get(props.selectedEntityId)
})

const metadataRows = computed(() => {
  const selected = entity.value
  if (!selected) return []

  const rows: { key: string; value: string }[] = []
  for (const key of Object.keys(selected.metadata)) {
    const value = selected.metadata[key]
    if (value !== undefined) rows.push({ key, value: formatMetadataValue(value) })
  }
  return rows
})

interface ReferenceGroup {
  readonly key: string
  readonly label: string
  readonly path: string
  readonly references: readonly ProjectReference[]
}

const incomingGroups = computed(() => referenceGroups(
  props.analysis,
  entity.value,
  'incoming',
))

const outgoingGroups = computed(() => referenceGroups(
  props.analysis,
  entity.value,
  'outgoing',
))

function referenceGroups(
  analysis: ProjectAnalysis,
  selected: ForgeEntity | undefined,
  direction: 'incoming' | 'outgoing',
): ReferenceGroup[] {
  if (!selected) return []

  const matches = analysis.references.filter((reference) => direction === 'incoming'
    ? reference.targetEntityId === selected.id
    : reference.sourceEntityId === selected.id)
  const grouped = new Map<string, { label: string; path: string; references: ProjectReference[] }>()

  for (const reference of matches) {
    const relatedId = direction === 'incoming'
      ? reference.sourceEntityId
      : reference.targetEntityId
    const related = relatedId ? analysis.index.byId.get(relatedId) : undefined
    const path = related?.sourcePath ?? reference.sourcePath
    const label = related?.name ?? (direction === 'incoming' ? path : reference.targetName)
    const key = `${path}\u0000${related?.id ?? label}`
    const group = grouped.get(key)

    if (group) {
      group.references.push(reference)
    } else {
      grouped.set(key, { label, path, references: [reference] })
    }
  }

  return [...grouped].map(([key, group]) => ({ key, ...group }))
}

function counterpart(reference: ProjectReference, direction: 'incoming' | 'outgoing') {
  const id = direction === 'incoming' ? reference.sourceEntityId : reference.targetEntityId
  return id ? props.analysis.index.byId.get(id) : undefined
}

function referenceName(reference: ProjectReference, direction: 'incoming' | 'outgoing'): string {
  const related = counterpart(reference, direction)
  if (related) return related.name
  return direction === 'incoming' ? reference.sourcePath : reference.targetName
}

function referencePath(reference: ProjectReference, direction: 'incoming' | 'outgoing'): string {
  return counterpart(reference, direction)?.sourcePath ?? reference.sourcePath
}

function referenceSourceLabel(reference: ProjectReference): string {
  if (reference.source === 'construct-expression') return 'expression'
  return reference.source === 'semantic' ? 'semantic' : 'name match'
}

function navigateToReference(reference: ProjectReference, direction: 'incoming' | 'outgoing'): void {
  const related = counterpart(reference, direction)
  if (related) emit('select', related.id)
}
</script>

<template>
  <section
    class="inspector-pane"
    aria-labelledby="inspector-title"
  >
    <template v-if="entity">
      <div class="inspector-heading">
        <div class="inspector-title-block">
          <p class="eyebrow">
            Entity details
          </p>
          <div class="entity-title-line">
            <h2 id="inspector-title">
              {{ entity.name || 'Unnamed entity' }}
            </h2>
            <span class="kind-tag">{{ entityKindLabel[entity.kind] }}</span>
          </div>
          <code class="entity-source-path">{{ entity.sourcePath }}</code>
        </div>
      </div>

      <div class="relationship-grid">
        <section
          class="relationship-section"
          aria-labelledby="incoming-title"
        >
          <div class="section-heading-line">
            <h3 id="incoming-title">
              Used by
            </h3>
            <span class="count-chip">{{ incomingGroups.reduce((total, group) => total + group.references.length, 0) }}</span>
          </div>
          <p
            v-if="incomingGroups.length === 0"
            class="relationship-empty"
          >
            No incoming references detected.
          </p>
          <ul
            v-else
            class="reference-groups"
          >
            <li
              v-for="group in incomingGroups"
              :key="group.key"
              class="reference-group"
            >
              <h4>{{ group.label }} <span>{{ group.path }}</span></h4>
              <ul class="reference-list">
                <li
                  v-for="reference in group.references"
                  :key="reference.id"
                  class="reference-row"
                >
                  <button
                    v-if="counterpart(reference, 'incoming')"
                    class="reference-link"
                    type="button"
                    @click="navigateToReference(reference, 'incoming')"
                  >
                    {{ referenceName(reference, 'incoming') }}
                  </button>
                  <span
                    v-else
                    class="reference-name"
                  >{{ referenceName(reference, 'incoming') }}</span>
                  <span class="reference-relationship">{{ reference.relationship }}</span>
                  <span class="reference-path">{{ referencePath(reference, 'incoming') }}</span>
                  <span
                    class="reference-source-tag"
                    :data-source="reference.source"
                  >
                    {{ referenceSourceLabel(reference) }} · {{ reference.confidence }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <section
          class="relationship-section"
          aria-labelledby="outgoing-title"
        >
          <div class="section-heading-line">
            <h3 id="outgoing-title">
              References
            </h3>
            <span class="count-chip">{{ outgoingGroups.reduce((total, group) => total + group.references.length, 0) }}</span>
          </div>
          <p
            v-if="outgoingGroups.length === 0"
            class="relationship-empty"
          >
            No outgoing references detected.
          </p>
          <ul
            v-else
            class="reference-groups"
          >
            <li
              v-for="group in outgoingGroups"
              :key="group.key"
              class="reference-group"
            >
              <h4>{{ group.label }} <span>{{ group.path }}</span></h4>
              <ul class="reference-list">
                <li
                  v-for="reference in group.references"
                  :key="reference.id"
                  class="reference-row"
                >
                  <button
                    v-if="counterpart(reference, 'outgoing')"
                    class="reference-link"
                    type="button"
                    @click="navigateToReference(reference, 'outgoing')"
                  >
                    {{ referenceName(reference, 'outgoing') }}
                  </button>
                  <span
                    v-else
                    class="reference-name"
                  >{{ referenceName(reference, 'outgoing') }}</span>
                  <span class="reference-relationship">{{ reference.relationship }}</span>
                  <span class="reference-path">{{ referencePath(reference, 'outgoing') }}</span>
                  <span
                    class="reference-source-tag"
                    :data-source="reference.source"
                  >
                    {{ referenceSourceLabel(reference) }} · {{ reference.confidence }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </div>

      <section
        v-if="metadataRows.length"
        class="metadata-section"
        aria-labelledby="metadata-title"
      >
        <h3 id="metadata-title">
          Indexed metadata
        </h3>
        <dl class="metadata-list">
          <div
            v-for="row in metadataRows"
            :key="row.key"
            class="metadata-row"
          >
            <dt>{{ row.key }}</dt>
            <dd><code>{{ row.value }}</code></dd>
          </div>
        </dl>
      </section>
    </template>

    <div
      v-else
      class="inspector-empty"
    >
      <p class="eyebrow">
        Entity details
      </p>
      <h2 id="inspector-title">
        Select an entity
      </h2>
      <p>Choose an item in the explorer or search results to see where it is used and what it references.</p>
    </div>
  </section>
</template>
