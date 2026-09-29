<script setup lang="ts">
import { computed } from 'vue'
import type { ForgeEntity, ProjectAnalysis, ProjectReference, RelationshipKind } from '../../core/types'
import {
  entityKindLabel,
  formatMetadataValue,
  referencesByRole,
  relationshipPresentation,
} from './presentation'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  'navigate-project-root': []
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
const eventSheetContext = computed(() => {
  if (entity.value?.kind !== 'function') return null
  const eventSheets = (props.analysis.index.bySourcePath.get(entity.value.sourcePath) ?? [])
    .filter((candidate) => candidate.kind === 'eventSheet')
  return eventSheets.length === 1 ? eventSheets[0] : null
})
const allIncomingReferences = computed(() => props.analysis.referencesByTarget.get(props.selectedEntityId) ?? [])
const allOutgoingReferences = computed(() => props.analysis.referencesBySource.get(props.selectedEntityId) ?? [])
const incomingReferences = computed(() => referencesByRole(allIncomingReferences.value, 'usage/dependency'))
const outgoingReferences = computed(() => referencesByRole(allOutgoingReferences.value, 'usage/dependency'))
const incomingStructureReferences = computed(() => referencesByRole(allIncomingReferences.value, 'structure/ownership'))
const outgoingStructureReferences = computed(() => referencesByRole(allOutgoingReferences.value, 'structure/ownership'))
const incomingGroups = computed(() => groupReferences(props.analysis, incomingReferences.value, 'sourceEntityId'))
const outgoingGroups = computed(() => groupReferences(props.analysis, outgoingReferences.value, 'targetEntityId'))
const incomingStructureGroups = computed(() => groupReferences(props.analysis, incomingStructureReferences.value, 'sourceEntityId'))
const outgoingStructureGroups = computed(() => groupReferences(props.analysis, outgoingStructureReferences.value, 'targetEntityId'))
const outgoingEntityCount = computed(() => new Set(outgoingReferences.value.map((reference) => reference.targetEntityId)).size)
const outgoingStructureEntityCount = computed(() => new Set(outgoingStructureReferences.value.map((reference) => reference.targetEntityId)).size)
const incomingStructureEntityCount = computed(() => new Set(incomingStructureReferences.value.map((reference) => reference.sourceEntityId)).size)
const structureReferenceCount = computed(() => incomingStructureReferences.value.length + outgoingStructureReferences.value.length)
const technicalReferences = computed(() => [...new Map(
  [...allIncomingReferences.value, ...allOutgoingReferences.value].map((reference) => [reference.id, reference]),
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
      label: relationshipPresentation(relationship).label,
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
  return relationshipPresentation(relationship).label
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
    class="entity-view min-w-0 px-[22px] pt-5 pb-7 max-[760px]:px-[14px] max-[760px]:pt-4 max-[760px]:pb-[21px]"
    aria-labelledby="entity-view-title"
  >
    <template v-if="entity">
      <header class="entity-view-heading flex flex-wrap items-end justify-between gap-x-5 gap-y-3 border-b border-line pb-4">
        <div class="entity-view-title-block">
          <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
            Entity
          </p>
          <nav
            class="entity-breadcrumb -mt-0.5 mb-[5px] flex items-center gap-[6px] text-[11px] text-text-muted"
            aria-label="Project breadcrumb"
          >
            <button
              class="cursor-pointer border-0 bg-transparent p-0 font-inherit text-accent hover:underline"
              type="button"
              @click="emit('navigate-project-root')"
            >
              Project
            </button>
            <span aria-hidden="true">›</span>
            <template v-if="eventSheetContext">
              <button
                class="cursor-pointer border-0 bg-transparent p-0 font-inherit text-accent hover:underline"
                type="button"
                @click="emit('select', eventSheetContext.id)"
              >
                {{ eventSheetContext.name }}
              </button>
              <span aria-hidden="true">›</span>
            </template>
            <span aria-current="page">{{ entity.name || 'Unnamed entity' }}</span>
          </nav>
          <h1
            id="entity-view-title"
            class="m-0 max-w-full break-words text-[clamp(20px,2vw,25px)] font-semibold tracking-[-.04em] text-text"
          >
            {{ entity.name || 'Unnamed entity' }}
          </h1>
          <span class="kind-tag mt-[7px] inline-flex rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent">{{ entityKindLabel[entity.kind] }}</span>
        </div>
        <p class="entity-view-summary mb-0.5 text-[13px] text-text-muted">
          Used in <strong class="text-[17px] font-semibold text-text">{{ incomingReferences.length }}</strong>
          {{ incomingReferences.length === 1 ? 'place' : 'places' }}
        </p>
      </header>

      <section
        class="used-in-section pt-[17px]"
        aria-labelledby="used-in-title"
      >
        <h2
          id="used-in-title"
          class="mt-0 mb-[11px] text-[15px] font-semibold text-text"
        >
          Where is this used?
        </h2>
        <p
          v-if="incomingGroups.length === 0"
          class="relationship-empty m-0 py-[10px] text-xs text-text-muted"
        >
          No indexed entities refer to {{ entity.name }}.
        </p>
        <ul
          v-else
          class="entity-relationship-groups m-0 list-none p-0"
        >
          <li
            v-for="group in incomingGroups"
            :key="group.id"
            class="entity-relationship-group border-t border-line-soft py-[10px] pb-2"
          >
            <div class="entity-related-heading flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-[7px]">
              <button
                class="entity-related-link min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-text hover:text-accent hover:underline hover:underline-offset-2"
                type="button"
                @click="emit('select', group.entity.id)"
              >
                {{ group.entity.name }}
              </button>
              <span class="kind-tag rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent">{{ entityKindLabel[group.entity.kind] }}</span>
              <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ group.count }}</span>
            </div>
            <ul class="entity-relationship-kinds m-0 list-none p-0 pl-3">
              <li
                v-for="relationship in group.relationships"
                :key="relationship.relationship"
              >
                <details class="occurrence-disclosure group mt-[5px]">
                  <summary class="flex min-h-[27px] cursor-pointer list-none items-center gap-[10px] text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
                    <span
                      class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
                      aria-hidden="true"
                    >›</span>
                    <span>{{ relationship.label }}</span>
                    <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ relationship.references.length }}</span>
                  </summary>
                  <ul class="occurrence-list m-0 grid list-none gap-[3px] p-[3px_0_5px_22px] text-[11px] text-text-dim">
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

      <details
        v-if="outgoingReferences.length > 0"
        class="uses-disclosure group mt-5 border-t border-line pt-3 [&>summary]:flex [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-[10px] [&>summary]:font-semibold [&>summary]:text-xs [&>summary]:text-text-muted [&>summary]:hover:text-text [&>summary]:focus-visible:outline-2 [&>summary]:focus-visible:outline-offset-[-2px] [&>summary]:focus-visible:outline-accent"
      >
        <summary class="flex min-h-7 cursor-pointer list-none items-center gap-[10px] text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <span
            class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
            aria-hidden="true"
          >›</span>Uses {{ outgoingEntityCount }} {{ outgoingEntityCount === 1 ? 'entity' : 'entities' }}
          <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ outgoingReferences.length }} occurrences</span>
        </summary>
        <p
          v-if="outgoingGroups.length === 0"
          class="relationship-empty m-0 py-[10px] text-xs text-text-muted"
        >
          This entity does not refer to other indexed entities.
        </p>
        <ul
          v-else
          class="entity-relationship-groups m-0 list-none p-0"
        >
          <li
            v-for="group in outgoingGroups"
            :key="group.id"
            class="entity-relationship-group border-t border-line-soft py-[10px] pb-2"
          >
            <div class="entity-related-heading flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-[7px]">
              <button
                class="entity-related-link min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-text hover:text-accent hover:underline hover:underline-offset-2"
                type="button"
                @click="emit('select', group.entity.id)"
              >
                {{ group.entity.name }}
              </button>
              <span class="kind-tag rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent">{{ entityKindLabel[group.entity.kind] }}</span>
              <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ group.count }}</span>
            </div>
            <ul class="entity-relationship-kinds m-0 list-none p-0 pl-3">
              <li
                v-for="relationship in group.relationships"
                :key="relationship.relationship"
              >
                <details class="occurrence-disclosure group mt-[5px]">
                  <summary class="flex min-h-[27px] cursor-pointer list-none items-center gap-[10px] text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
                    <span
                      class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
                      aria-hidden="true"
                    >›</span>
                    <span>{{ relationship.label }}</span>
                    <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ relationship.references.length }}</span>
                  </summary>
                  <ul class="occurrence-list m-0 grid list-none gap-[3px] p-[3px_0_5px_22px] text-[11px] text-text-dim">
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

      <details
        v-if="structureReferenceCount > 0"
        class="structure-disclosure group mt-5 border-t border-line pt-3 [&>summary]:flex [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-[10px] [&>summary]:font-semibold [&>summary]:text-xs [&>summary]:text-text-muted [&>summary]:hover:text-text [&>summary]:focus-visible:outline-2 [&>summary]:focus-visible:outline-offset-[-2px] [&>summary]:focus-visible:outline-accent"
      >
        <summary class="flex min-h-7 cursor-pointer list-none items-center gap-[10px] text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <span
            class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
            aria-hidden="true"
          >›</span>Structure
          <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ structureReferenceCount }} relationships</span>
        </summary>
        <section
          v-if="incomingStructureGroups.length"
          class="structure-group-section mt-3"
          aria-label="Structure leading to this entity"
        >
          <h3 class="mt-0 mb-[5px] text-[11px] font-semibold text-text-dim">
            From {{ incomingStructureEntityCount }} {{ incomingStructureEntityCount === 1 ? 'entity' : 'entities' }}
          </h3>
          <ul class="entity-relationship-groups m-0 list-none p-0">
            <li
              v-for="group in incomingStructureGroups"
              :key="group.id"
              class="entity-relationship-group border-t border-line-soft py-[10px] pb-2"
            >
              <div class="entity-related-heading flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-[7px]">
                <button
                  class="entity-related-link min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-text hover:text-accent hover:underline hover:underline-offset-2"
                  type="button"
                  @click="emit('select', group.entity.id)"
                >
                  {{ group.entity.name }}
                </button>
                <span class="kind-tag rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent">{{ entityKindLabel[group.entity.kind] }}</span>
                <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ group.count }}</span>
              </div>
              <ul class="entity-relationship-kinds m-0 list-none p-0 pl-3">
                <li
                  v-for="relationship in group.relationships"
                  :key="relationship.relationship"
                >
                  <details class="occurrence-disclosure group mt-[5px]">
                    <summary class="flex min-h-[27px] cursor-pointer list-none items-center gap-[10px] text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
                      <span
                        class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
                        aria-hidden="true"
                      >›</span>
                      <span>{{ relationship.label }}</span>
                      <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ relationship.references.length }}</span>
                    </summary>
                    <ul class="occurrence-list m-0 grid list-none gap-[3px] p-[3px_0_5px_22px] text-[11px] text-text-dim">
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
        <section
          v-if="outgoingStructureGroups.length"
          class="structure-group-section mt-3"
          aria-label="Structure owned or defined by this entity"
        >
          <h3 class="mt-0 mb-[5px] text-[11px] font-semibold text-text-dim">
            To {{ outgoingStructureEntityCount }} {{ outgoingStructureEntityCount === 1 ? 'entity' : 'entities' }}
          </h3>
          <ul class="entity-relationship-groups m-0 list-none p-0">
            <li
              v-for="group in outgoingStructureGroups"
              :key="group.id"
              class="entity-relationship-group border-t border-line-soft py-[10px] pb-2"
            >
              <div class="entity-related-heading flex min-w-0 flex-wrap items-center gap-x-[9px] gap-y-[7px]">
                <button
                  class="entity-related-link min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-text hover:text-accent hover:underline hover:underline-offset-2"
                  type="button"
                  @click="emit('select', group.entity.id)"
                >
                  {{ group.entity.name }}
                </button>
                <span class="kind-tag rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent">{{ entityKindLabel[group.entity.kind] }}</span>
                <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ group.count }}</span>
              </div>
              <ul class="entity-relationship-kinds m-0 list-none p-0 pl-3">
                <li
                  v-for="relationship in group.relationships"
                  :key="relationship.relationship"
                >
                  <details class="occurrence-disclosure group mt-[5px]">
                    <summary class="flex min-h-[27px] cursor-pointer list-none items-center gap-[10px] text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
                      <span
                        class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
                        aria-hidden="true"
                      >›</span>
                      <span>{{ relationship.label }}</span>
                      <span class="entity-relationship-count ml-auto tabular-nums text-[11px] text-text-dim">{{ relationship.references.length }}</span>
                    </summary>
                    <ul class="occurrence-list m-0 grid list-none gap-[3px] p-[3px_0_5px_22px] text-[11px] text-text-dim">
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
      </details>

      <details class="technical-details-section group mt-5 border-t border-line pt-3 [&>summary]:flex [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-[10px] [&>summary]:font-semibold [&>summary]:text-xs [&>summary]:text-text-muted [&>summary]:hover:text-text [&>summary]:focus-visible:outline-2 [&>summary]:focus-visible:outline-offset-[-2px] [&>summary]:focus-visible:outline-accent">
        <summary class="flex min-h-7 cursor-pointer list-none items-center gap-[10px] text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <span
            class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
            aria-hidden="true"
          >›</span>Technical details
        </summary>
        <dl class="metadata-list mt-2 mb-0 grid grid-cols-2 gap-x-[18px] gap-y-0 max-[760px]:grid-cols-1">
          <div class="flex min-w-0 justify-between gap-[10px] border-b border-line-soft py-[5px]">
            <dt class="min-w-0 text-[10px] text-text-dim">
              Source file
            </dt>
            <dd class="m-0 min-w-0 max-w-[68%] break-words text-right text-[11px] text-text-muted">
              <code class="break-words text-[10px]">{{ entity.sourcePath }}</code>
            </dd>
          </div>
          <div
            v-if="entity.metadata.sid !== undefined"
            class="flex min-w-0 justify-between gap-[10px] border-b border-line-soft py-[5px]"
          >
            <dt class="min-w-0 text-[10px] text-text-dim">
              SID
            </dt>
            <dd class="m-0 min-w-0 max-w-[68%] break-words text-right text-[11px] text-text-muted">
              <code class="break-words text-[10px]">{{ formatMetadataValue(entity.metadata.sid) }}</code>
            </dd>
          </div>
          <div
            v-for="row in metadataRows"
            :key="row.key"
            class="flex min-w-0 justify-between gap-[10px] border-b border-line-soft py-[5px]"
          >
            <dt class="min-w-0 text-[10px] text-text-dim">
              {{ row.key }}
            </dt>
            <dd class="m-0 min-w-0 max-w-[68%] break-words text-right text-[11px] text-text-muted">
              <code class="break-words text-[10px]">{{ row.value }}</code>
            </dd>
          </div>
        </dl>
        <details
          v-if="technicalReferences.length"
          class="technical-occurrences group mt-3 [&>summary]:flex [&>summary]:min-h-7 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-[10px] [&>summary]:text-[11px] [&>summary]:text-text-muted [&>summary]:hover:text-text [&>summary]:focus-visible:outline-2 [&>summary]:focus-visible:outline-offset-[-2px] [&>summary]:focus-visible:outline-accent"
        >
          <summary class="flex min-h-7 cursor-pointer list-none items-center gap-[10px] text-[11px] text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
            <span
              class="shrink-0 text-[15px] text-text-dim transition-transform duration-[120ms] group-open:rotate-90"
              aria-hidden="true"
            >›</span>Relationship source locations ({{ technicalReferences.length }})
          </summary>
          <ul class="mt-1 mb-0 max-h-[260px] list-none overflow-auto p-0">
            <li
              v-for="reference in technicalReferences"
              :key="reference.id"
              class="grid grid-cols-[minmax(90px,.7fr)_minmax(100px,.6fr)_minmax(0,1.6fr)] gap-2 border-t border-line-soft py-[5px] text-[10px] text-text-dim max-[760px]:grid-cols-1 max-[760px]:gap-[3px]"
            >
              <code class="break-words text-[10px] text-text-muted">{{ reference.sourcePath }}</code>
              <span>{{ relationshipLabel(reference.relationship) }}</span>
              <code class="break-words text-[10px] text-text-muted">{{ exactLocation(reference) }}</code>
            </li>
          </ul>
        </details>
      </details>
    </template>
  </section>
</template>
