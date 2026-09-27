<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectReference } from '../../core/types'
import { chooseRelationshipTab, entityKindLabel, formatMetadataValue } from './presentation'

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
  readonly entityId?: string
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
const activeDirection = ref<'incoming' | 'outgoing'>('incoming')

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

const activeSection = computed(() => relationshipSections.value.find((section) => section.direction === activeDirection.value))
const relationshipTabCounts = computed(() => ({
  entityId: props.selectedEntityId,
  incoming: relationshipSections.value.find((section) => section.direction === 'incoming')?.count ?? 0,
  outgoing: relationshipSections.value.find((section) => section.direction === 'outgoing')?.count ?? 0,
}))

watch(relationshipTabCounts, ({ incoming, outgoing }) => {
  activeDirection.value = chooseRelationshipTab(activeDirection.value, incoming, outgoing)
}, { immediate: true })

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
    else grouped.set(key, { label, path, ...(related ? { entityId: related.id } : {}), references: [reference] })
  }

  return [...grouped].map(([key, group]) => ({ key, ...group }))
}

function countReferences(...collections: readonly ReferenceGroup[][]): number {
  return collections.reduce((total, groups) => total
    + groups.reduce((count, group) => count + group.references.length, 0), 0)
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
  if (reference.source === 'construct-expression') return 'Expression'
  return reference.source === 'semantic' ? 'Semantic' : 'Possible'
}

function relationshipLabel(relationship: string): string {
  const labels: Readonly<Record<string, string>> = {
    'event-object-reference': 'Object reference',
    'event-variable-action': 'Variable action',
    'event-variable-condition': 'Variable condition',
    'event-variable-expression': 'Variable expression',
    'event-sheet-include': 'Included event sheet',
    'family-member': 'Family member',
    'function-call': 'Function call',
    'function-call-expression': 'Function call in expression',
    'layout-event-sheet': 'Layout event sheet',
    'layout-instance': 'Layout instance',
    'exact-string-match': 'Exact string match',
  }
  return labels[relationship] ?? relationship.replaceAll('-', ' ')
}

function handleTabKeydown(event: KeyboardEvent): void {
  let direction: 'incoming' | 'outgoing' | undefined
  if (event.key === 'ArrowLeft' || event.key === 'Home') direction = 'incoming'
  else if (event.key === 'ArrowRight' || event.key === 'End') direction = 'outgoing'
  if (!direction) return

  event.preventDefault()
  activeDirection.value = direction
  void nextTick(() => document.getElementById(`reference-tab-${direction}`)?.focus())
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

      <div
        class="reference-tabs"
        role="tablist"
        aria-label="Entity references"
        @keydown="handleTabKeydown"
      >
        <button
          v-for="section in relationshipSections"
          :id="`reference-tab-${section.direction}`"
          :key="section.direction"
          class="reference-tab"
          type="button"
          role="tab"
          :aria-selected="activeDirection === section.direction"
          :aria-controls="`reference-panel-${section.direction}`"
          :tabindex="activeDirection === section.direction ? 0 : -1"
          @click="activeDirection = section.direction"
        >
          {{ section.label }} <span>{{ section.count }}</span>
        </button>
      </div>

      <section
        v-if="activeSection"
        :id="`reference-panel-${activeSection.direction}`"
        class="relationship-section"
        role="tabpanel"
        :aria-labelledby="`reference-tab-${activeSection.direction}`"
      >
        <template v-if="activeSection.count === 0">
          <p
            class="relationship-empty"
          >
            {{ activeSection.emptyText }}
          </p>
        </template>
        <template v-else>
          <div
            v-for="subgroup in activeSection.subgroups"
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
                  <h4
                    class="reference-group-title"
                    :title="group.path"
                  >
                    <button
                      v-if="group.entityId"
                      type="button"
                      class="reference-group-link"
                      @click="emit('select', group.entityId)"
                    >
                      {{ group.label }}
                    </button>
                    <span v-else>{{ group.label }}</span>
                    <span class="reference-group-count">{{ group.references.length }}</span>
                  </h4>
                  <ul class="reference-list">
                    <li
                      v-for="reference in group.references"
                      :key="reference.id"
                      class="reference-row"
                    >
                      <div class="reference-row-main">
                        <span class="reference-relationship">{{ relationshipLabel(reference.relationship) }}</span>
                        <span
                          class="reference-source-tag"
                          :data-source="reference.source"
                        >{{ referenceSourceLabel(reference) }}</span>
                      </div>
                      <details class="reference-details">
                        <summary :aria-label="`Details for ${reference.targetName}`">
                          Details
                        </summary>
                        <dl class="reference-detail-list">
                          <div>
                            <dt>Source file</dt>
                            <dd><code>{{ reference.sourcePath }}</code></dd>
                          </div>
                          <div>
                            <dt>Location</dt>
                            <dd><code>{{ referenceLocationLabel(reference) }}</code></dd>
                          </div>
                          <div>
                            <dt>Target</dt>
                            <dd>{{ reference.targetName }}</dd>
                          </div>
                          <div>
                            <dt>Confidence</dt>
                            <dd>{{ reference.confidence }}</dd>
                          </div>
                        </dl>
                      </details>
                    </li>
                  </ul>
                </li>
              </ul>
            </template>
          </div>
        </template>
      </section>

      <details
        v-if="metadataRows.length"
        class="metadata-section"
      >
        <summary id="metadata-title">
          Indexed metadata
        </summary>
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
      </details>
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
