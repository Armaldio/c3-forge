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

interface ReferenceSubgroup {
  readonly confidence: 'known' | 'possible'
  readonly label: string
  readonly note?: string
  readonly groups: readonly ReferenceGroup[]
}

interface RelationshipSection {
  readonly direction: 'incoming' | 'outgoing'
  readonly label: string
  readonly emptyText: string
  readonly count: number
  readonly subgroups: readonly ReferenceSubgroup[]
}

const incomingKnownGroups = computed(() => referenceGroups(props.analysis, entity.value, 'incoming', 'known'))
const incomingPossibleGroups = computed(() => referenceGroups(props.analysis, entity.value, 'incoming', 'possible'))
const outgoingKnownGroups = computed(() => referenceGroups(props.analysis, entity.value, 'outgoing', 'known'))
const outgoingPossibleGroups = computed(() => referenceGroups(props.analysis, entity.value, 'outgoing', 'possible'))

const relationshipSections = computed<readonly RelationshipSection[]>(() => [
  {
    direction: 'incoming',
    label: 'Used by',
    emptyText: 'No incoming references detected.',
    count: countReferences(incomingKnownGroups.value, incomingPossibleGroups.value),
    subgroups: [
      { confidence: 'known', label: 'Known references', groups: incomingKnownGroups.value },
      {
        confidence: 'possible',
        label: 'Possible name matches',
        note: 'Exact-string matches can be coincidental.',
        groups: incomingPossibleGroups.value,
      },
    ],
  },
  {
    direction: 'outgoing',
    label: 'References',
    emptyText: 'No outgoing references detected.',
    count: countReferences(outgoingKnownGroups.value, outgoingPossibleGroups.value),
    subgroups: [
      { confidence: 'known', label: 'Known references', groups: outgoingKnownGroups.value },
      {
        confidence: 'possible',
        label: 'Possible name matches',
        note: 'Exact-string matches can be coincidental.',
        groups: outgoingPossibleGroups.value,
      },
    ],
  },
])

function referenceGroups(
  analysis: ProjectAnalysis,
  selected: ForgeEntity | undefined,
  direction: 'incoming' | 'outgoing',
  confidence: 'known' | 'possible',
): ReferenceGroup[] {
  if (!selected) return []

  const indexedReferences = direction === 'incoming'
    ? analysis.referencesByTarget.get(selected.id) ?? []
    : analysis.referencesBySource.get(selected.id) ?? []
  const matches = indexedReferences.filter((reference) => confidence === 'possible'
    ? reference.source === 'exact-string-fallback'
    : reference.source !== 'exact-string-fallback')
  const grouped = new Map<string, { label: string; path: string; references: ProjectReference[] }>()

  for (const reference of matches) {
    const relatedId = direction === 'incoming' ? reference.sourceEntityId : reference.targetEntityId
    const related = relatedId ? analysis.index.byId.get(relatedId) : undefined
    const path = related?.sourcePath ?? reference.sourcePath
    const label = related?.name ?? (direction === 'incoming' ? path : reference.targetName)
    const key = `${path}\u0000${related?.id ?? label}`
    const group = grouped.get(key)

    if (group) group.references.push(reference)
    else grouped.set(key, { label, path, references: [reference] })
  }

  return [...grouped].map(([key, group]) => ({ key, ...group }))
}

function countReferences(...collections: readonly ReferenceGroup[][]): number {
  return collections.reduce((total, groups) => total
    + groups.reduce((count, group) => count + group.references.length, 0), 0)
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

function referenceLocationLabel(reference: ProjectReference): string {
  const location = reference.sourceLocation
  if (!location) return reference.sourcePath
  const details = [
    location.functionSid ? `function SID ${location.functionSid}` : undefined,
    location.eventSid ? `event SID ${location.eventSid}` : undefined,
    location.entryKind && location.entryIndex !== undefined
      ? `${location.entryKind} ${location.entryIndex + 1}`
      : undefined,
    location.jsonPath,
  ].filter((detail): detail is string => detail !== undefined)
  return details.join(' · ') || reference.sourcePath
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
          v-for="section in relationshipSections"
          :key="section.direction"
          class="relationship-section"
          :aria-label="section.label"
        >
          <div class="section-heading-line">
            <h3>{{ section.label }}</h3>
            <span class="count-chip">{{ section.count }}</span>
          </div>
          <p
            v-if="section.count === 0"
            class="relationship-empty"
          >
            {{ section.emptyText }}
          </p>
          <div
            v-for="subgroup in section.subgroups"
            v-else
            :key="subgroup.confidence"
            class="reference-confidence-section"
            :data-confidence="subgroup.confidence"
          >
            <template v-if="subgroup.groups.length">
              <h4 class="reference-confidence-title">
                {{ subgroup.label }}
              </h4>
              <p
                v-if="subgroup.note"
                class="reference-confidence-note"
              >
                {{ subgroup.note }}
              </p>
              <ul class="reference-groups">
                <li
                  v-for="group in subgroup.groups"
                  :key="group.key"
                  class="reference-group"
                >
                  <h5>{{ group.label }} <span>{{ group.path }}</span></h5>
                  <ul class="reference-list">
                    <li
                      v-for="reference in group.references"
                      :key="reference.id"
                      class="reference-row"
                    >
                      <button
                        v-if="counterpart(reference, section.direction)"
                        class="reference-link"
                        type="button"
                        @click="navigateToReference(reference, section.direction)"
                      >
                        {{ referenceName(reference, section.direction) }}
                      </button>
                      <span
                        v-else
                        class="reference-name"
                      >{{ referenceName(reference, section.direction) }}</span>
                      <span class="reference-relationship">{{ reference.relationship }}</span>
                      <span class="reference-path">{{ referencePath(reference, section.direction) }}</span>
                      <span class="reference-location">{{ referenceLocationLabel(reference) }}</span>
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
            </template>
          </div>
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
