<script setup lang="ts">
import { computed } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectReference, RelationshipKind } from '../../core/types'
import { entityKindLabel, formatMetadataValue } from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

interface RelationshipGroup {
  readonly relationship: RelationshipKind
  readonly label: string
  readonly references: readonly ProjectReference[]
}

interface RelatedEntityGroup {
  readonly id: string
  readonly entity: ForgeEntity
  readonly count: number
  readonly relationships: readonly RelationshipGroup[]
}

const entity = computed(() => props.analysis.index.byId.get(props.selectedEntityId))
const incomingReferences = computed(() => props.analysis.referencesByTarget.get(props.selectedEntityId) ?? [])
const outgoingReferences = computed(() => props.analysis.referencesBySource.get(props.selectedEntityId) ?? [])
const incomingGroups = computed(() => groupReferences(props.analysis, incomingReferences.value, 'sourceEntityId'))
const outgoingGroups = computed(() => groupReferences(props.analysis, outgoingReferences.value, 'targetEntityId'))
const outgoingEntityCount = computed(() => new Set(outgoingReferences.value.map((reference) => reference.targetEntityId)).size)
const technicalReferences = computed(() => [...new Map(
  [...incomingReferences.value, ...outgoingReferences.value].map((reference) => [reference.id, reference]),
).values()])
const metadataRows = computed(() => Object.entries(entity.value?.metadata ?? {})
  .filter(([key]) => key !== 'sid')
  .map(([key, value]) => ({ key, value: formatMetadataValue(value) })))

function groupReferences(
  analysis: ProjectAnalysis,
  references: readonly ProjectReference[],
  relatedEntityKey: 'sourceEntityId' | 'targetEntityId',
): RelatedEntityGroup[] {
  const related = new Map<string, { entity: ForgeEntity; relationships: Map<RelationshipKind, ProjectReference[]> }>()
  for (const reference of references) {
    const id = reference[relatedEntityKey]
    const relatedEntity = analysis.index.byId.get(id)
    if (!relatedEntity) continue
    const group = related.get(id) ?? { entity: relatedEntity, relationships: new Map() }
    const occurrences = group.relationships.get(reference.relationship) ?? []
    occurrences.push(reference)
    group.relationships.set(reference.relationship, occurrences)
    related.set(id, group)
  }

  return [...related].map(([id, group]) => {
    const relationships = [...group.relationships].map(([relationship, occurrences]) => ({
      relationship,
      label: relationshipLabel(relationship),
      references: occurrences,
    })).sort((left, right) => left.label.localeCompare(right.label))
    return {
      id,
      entity: group.entity,
      count: relationships.reduce((total, relationship) => total + relationship.references.length, 0),
      relationships,
    }
  }).sort((left, right) => left.entity.name.localeCompare(right.entity.name))
}

function relationshipLabel(relationship: RelationshipKind): string {
  const labels: Readonly<Record<RelationshipKind, string>> = {
    'family-member': 'Family membership',
    'layout-layer': 'Layout layer',
    'layer-child': 'Nested layer',
    'layer-instance': 'Layer instance',
    'layout-instance-type': 'Instance object type',
    'layout-event-sheet': 'Layout event sheet',
    'event-sheet-event': 'Event sheet block',
    'event-child': 'Nested event block',
    'event-defines-function': 'Function definition',
    'event-sheet-include': 'Included event sheet',
    'behavior-attachment': 'Attached behavior',
    'object-animation': 'Animation',
    'animation-frame': 'Animation frame',
    'frame-image': 'Frame image',
    'folder-resource': 'Folder content',
    'folder-child': 'Nested folder',
    'object-reference': 'Object reference',
    'function-call': 'Function call',
    'event-variable-reference': 'Event variable',
    'instance-variable-reference': 'Instance variable',
    'family-variable-reference': 'Family variable',
  }
  return labels[relationship]
}

function occurrenceLabel(reference: ProjectReference): string {
  const location = reference.sourceLocation
  if (!location) return 'Occurrence'
  const parts = [
    location.entryKind && location.entryIndex !== undefined
      ? `${location.entryKind === 'action' ? 'Action' : 'Condition'} ${location.entryIndex + 1}`
      : undefined,
  ].filter((part): part is string => part !== undefined)
  return parts.join(' · ') || 'Occurrence'
}

function exactLocation(reference: ProjectReference): string {
  const location = reference.sourceLocation
  if (!location) return reference.sourcePath
  return [
    location.functionSid ? `function SID ${location.functionSid}` : undefined,
    location.eventSid ? `event SID ${location.eventSid}` : undefined,
    location.eventPath,
    location.entryKind && location.entryIndex !== undefined
      ? `${location.entryKind} ${location.entryIndex}`
      : undefined,
    location.jsonPath,
    location.expressionRange
      ? `expression ${location.expressionRange.start}–${location.expressionRange.end}`
      : undefined,
  ].filter((part): part is string => part !== undefined).join(' · ')
}
</script>

<template>
  <section
    class="entity-view"
    aria-labelledby="entity-view-title"
  >
    <template v-if="entity">
      <header class="entity-view-heading">
        <div class="entity-view-title-block">
          <p class="eyebrow">
            Entity
          </p>
          <h1 id="entity-view-title">
            {{ entity.name || 'Unnamed entity' }}
          </h1>
          <span class="kind-tag">{{ entityKindLabel[entity.kind] }}</span>
        </div>
        <p class="entity-view-summary">
          Used in <strong>{{ incomingReferences.length }}</strong>
          {{ incomingReferences.length === 1 ? 'place' : 'places' }}
        </p>
      </header>

      <section
        class="used-in-section"
        aria-labelledby="used-in-title"
      >
        <h2 id="used-in-title">
          Where is this used?
        </h2>
        <p
          v-if="incomingGroups.length === 0"
          class="relationship-empty"
        >
          No indexed entities refer to {{ entity.name }}.
        </p>
        <ul
          v-else
          class="entity-relationship-groups"
        >
          <li
            v-for="group in incomingGroups"
            :key="group.id"
            class="entity-relationship-group"
          >
            <div class="entity-related-heading">
              <button
                class="entity-related-link"
                type="button"
                @click="emit('select', group.entity.id)"
              >
                {{ group.entity.name }}
              </button>
              <span class="kind-tag">{{ entityKindLabel[group.entity.kind] }}</span>
              <span class="entity-relationship-count">{{ group.count }}</span>
            </div>
            <ul class="entity-relationship-kinds">
              <li
                v-for="relationship in group.relationships"
                :key="relationship.relationship"
              >
                <details class="occurrence-disclosure">
                  <summary>
                    <span>{{ relationship.label }}</span>
                    <span class="entity-relationship-count">{{ relationship.references.length }}</span>
                  </summary>
                  <ul class="occurrence-list">
                    <li
                      v-for="reference in relationship.references"
                      :key="reference.id"
                    >
                      {{ occurrenceLabel(reference) }}
                    </li>
                  </ul>
                </details>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <details class="uses-disclosure">
        <summary>
          Uses {{ outgoingEntityCount }} {{ outgoingEntityCount === 1 ? 'entity' : 'entities' }}
          <span class="entity-relationship-count">{{ outgoingReferences.length }} occurrences</span>
        </summary>
        <p
          v-if="outgoingGroups.length === 0"
          class="relationship-empty"
        >
          This entity does not refer to other indexed entities.
        </p>
        <ul
          v-else
          class="entity-relationship-groups"
        >
          <li
            v-for="group in outgoingGroups"
            :key="group.id"
            class="entity-relationship-group"
          >
            <div class="entity-related-heading">
              <button
                class="entity-related-link"
                type="button"
                @click="emit('select', group.entity.id)"
              >
                {{ group.entity.name }}
              </button>
              <span class="kind-tag">{{ entityKindLabel[group.entity.kind] }}</span>
              <span class="entity-relationship-count">{{ group.count }}</span>
            </div>
            <ul class="entity-relationship-kinds">
              <li
                v-for="relationship in group.relationships"
                :key="relationship.relationship"
              >
                <details class="occurrence-disclosure">
                  <summary>
                    <span>{{ relationship.label }}</span>
                    <span class="entity-relationship-count">{{ relationship.references.length }}</span>
                  </summary>
                  <ul class="occurrence-list">
                    <li
                      v-for="reference in relationship.references"
                      :key="reference.id"
                    >
                      {{ occurrenceLabel(reference) }}
                    </li>
                  </ul>
                </details>
              </li>
            </ul>
          </li>
        </ul>
      </details>

      <details class="technical-details-section">
        <summary>Technical details</summary>
        <dl class="metadata-list">
          <div>
            <dt>Source file</dt>
            <dd><code>{{ entity.sourcePath }}</code></dd>
          </div>
          <div v-if="entity.metadata.sid !== undefined">
            <dt>SID</dt>
            <dd><code>{{ formatMetadataValue(entity.metadata.sid) }}</code></dd>
          </div>
          <div
            v-for="row in metadataRows"
            :key="row.key"
          >
            <dt>{{ row.key }}</dt>
            <dd><code>{{ row.value }}</code></dd>
          </div>
        </dl>
        <details
          v-if="technicalReferences.length"
          class="technical-occurrences"
        >
          <summary>Relationship source locations ({{ technicalReferences.length }})</summary>
          <ul>
            <li
              v-for="reference in technicalReferences"
              :key="reference.id"
            >
              <code>{{ reference.sourcePath }}</code>
              <span>{{ relationshipLabel(reference.relationship) }}</span>
              <code>{{ exactLocation(reference) }}</code>
            </li>
          </ul>
        </details>
      </details>
    </template>
  </section>
</template>
