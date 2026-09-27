<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ProjectAnalysis, RelationshipKind } from '../../core/types'
import { entityKindLabel } from './presentation'
import {
  buildGraphModel,
  graphEntityKinds,
  graphFocusEntityId,
  graphRelationshipKinds,
  type GraphEntityKind,
  type GraphMode,
} from './graph-model'

const props = defineProps<{
  analysis: ProjectAnalysis
  selectedEntityId: string | null
}>()

const emit = defineEmits<{
  'open-entity': [id: string]
}>()

const DEFAULT_ENTITY_KINDS: readonly GraphEntityKind[] = ['eventSheet', 'function', 'object', 'family', 'layout']
const entityFilters = reactive<Record<GraphEntityKind, boolean>>({
  eventSheet: true,
  function: true,
  object: true,
  family: true,
  layout: true,
  variable: false,
})
const relationshipFilters = reactive<Record<RelationshipKind, boolean>>({
  'family-member': true,
  'layout-instance': true,
  'layout-event-sheet': true,
  'event-sheet-include': true,
  'object-reference': true,
  'function-call': true,
  'event-variable-reference': true,
  'instance-variable-reference': true,
  'family-variable-reference': true,
})
const graphMode = ref<GraphMode>(props.selectedEntityId || props.analysis.stats.totalEntities > 150 ? 'focus' : 'project')
const focusHops = ref<1 | 2>(1)
const graphSelectedId = ref(props.selectedEntityId
  ?? graphFocusEntityId(props.analysis, DEFAULT_ENTITY_KINDS)
  ?? '')
const graphSelectionExplicit = ref(Boolean(props.selectedEntityId))
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const graphCanvas = ref<HTMLElement | null>(null)
const dragOrigin = ref<{ pointerX: number; pointerY: number; panX: number; panY: number }>()

if (props.analysis.index.byId.get(props.selectedEntityId ?? '')?.kind === 'variable') entityFilters.variable = true

const selectedKinds = computed(() => graphEntityKinds.filter((kind) => entityFilters[kind]))
const selectedRelationships = computed(() => graphRelationshipKinds.filter((kind) => relationshipFilters[kind]))
const focusEntityId = computed(() => {
  const selected = graphSelectedId.value || props.selectedEntityId
  if (selected) return selected
  return graphFocusEntityId(props.analysis, selectedKinds.value)
})
const model = computed(() => buildGraphModel(props.analysis, {
  entityKinds: selectedKinds.value,
  relationships: selectedRelationships.value,
  mode: graphMode.value,
  ...(focusEntityId.value ? { focusEntityId: focusEntityId.value } : {}),
  focusHops: focusHops.value,
}))
const graphPositions = computed(() => new Map(model.value.nodes.map((node) => [node.entity.id, node.position])))
const graphNeighborIds = computed(() => {
  if (!graphSelectedId.value) return new Set<string>()
  return new Set(model.value.edges.flatMap((edge) => {
    if (edge.source.id === graphSelectedId.value) return [edge.target.id]
    if (edge.target.id === graphSelectedId.value) return [edge.source.id]
    return []
  }))
})
const selectedEntity = computed(() => graphSelectedId.value
  ? props.analysis.index.byId.get(graphSelectedId.value)
  : undefined)
const selectedEntityIncoming = computed(() => selectedEntity.value
  ? props.analysis.referencesByTarget.get(selectedEntity.value.id)?.length ?? 0
  : 0)
const selectedEntityOutgoing = computed(() => selectedEntity.value
  ? props.analysis.referencesBySource.get(selectedEntity.value.id)?.length ?? 0
  : 0)
const filterCount = computed(() => selectedKinds.value.length + selectedRelationships.value.length)

watch(() => props.selectedEntityId, (entityId) => {
  if (!entityId) return
  graphSelectedId.value = entityId
  graphSelectionExplicit.value = true
  const entity = props.analysis.index.byId.get(entityId)
  if (entity?.kind === 'variable') entityFilters.variable = true
  graphMode.value = 'focus'
})

watch(() => props.analysis, (analysis) => {
  graphSelectedId.value = props.selectedEntityId
    ?? graphFocusEntityId(analysis, DEFAULT_ENTITY_KINDS)
    ?? ''
  graphSelectionExplicit.value = Boolean(props.selectedEntityId)
  graphMode.value = props.selectedEntityId || analysis.stats.totalEntities > 150 ? 'focus' : 'project'
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
})

function chooseNode(entityId: string): void {
  graphSelectedId.value = entityId
  graphSelectionExplicit.value = true
}

function openSelectedEntity(): void {
  if (selectedEntity.value) emit('open-entity', selectedEntity.value.id)
}

function relationshipLabel(relationship: RelationshipKind): string {
  const labels: Readonly<Record<RelationshipKind, string>> = {
    'family-member': 'member',
    'layout-instance': 'instances',
    'layout-event-sheet': 'sheet',
    'event-sheet-include': 'includes',
    'object-reference': 'uses',
    'function-call': 'calls',
    'event-variable-reference': 'uses variable',
    'instance-variable-reference': 'uses instance variable',
    'family-variable-reference': 'uses family variable',
  }
  return labels[relationship]
}

function edgePath(sourceId: string, targetId: string): string {
  const source = graphPositions.value.get(sourceId)
  const target = graphPositions.value.get(targetId)
  if (!source || !target) return ''
  const nodeWidth = 208
  const nodeHeight = 70
  const sourceCenterY = source.y + nodeHeight / 2
  const targetCenterY = target.y + nodeHeight / 2

  if (source.x === target.x) {
    const direction = targetCenterY >= sourceCenterY ? 1 : -1
    const sourceY = source.y + (direction > 0 ? nodeHeight : 0)
    const targetY = target.y + (direction > 0 ? 0 : nodeHeight)
    const side = source.x + nodeWidth + 54
    return `M ${source.x + nodeWidth} ${sourceY} C ${side} ${sourceY}, ${side} ${targetY}, ${target.x + nodeWidth} ${targetY}`
  }

  const forward = target.x > source.x
  const startX = source.x + (forward ? nodeWidth : 0)
  const endX = target.x + (forward ? 0 : nodeWidth)
  const middleX = (startX + endX) / 2
  return `M ${startX} ${sourceCenterY} C ${middleX} ${sourceCenterY}, ${middleX} ${targetCenterY}, ${endX} ${targetCenterY}`
}

function edgeMidpoint(sourceId: string, targetId: string): { x: number; y: number } {
  const source = graphPositions.value.get(sourceId)
  const target = graphPositions.value.get(targetId)
  if (!source || !target) return { x: 0, y: 0 }
  return { x: (source.x + target.x + 208) / 2, y: (source.y + target.y + 70) / 2 - 12 }
}

function isDirectEdge(sourceId: string, targetId: string): boolean {
  return !graphSelectionExplicit.value
    || graphSelectedId.value === sourceId
    || graphSelectedId.value === targetId
}

function edgeDirection(sourceId: string, targetId: string): 'outgoing' | 'incoming' | 'other' {
  if (graphSelectedId.value === sourceId) return 'outgoing'
  if (graphSelectedId.value === targetId) return 'incoming'
  return 'other'
}

function clampZoom(value: number): void {
  zoom.value = Math.min(2.25, Math.max(0.2, Number(value.toFixed(2))))
}

function changeZoom(amount: number): void {
  clampZoom(zoom.value + amount)
}

function startPan(event: PointerEvent): void {
  if (event.button !== 0) return
  dragOrigin.value = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    panX: pan.value.x,
    panY: pan.value.y,
  }
  if (event.currentTarget instanceof Element) event.currentTarget.setPointerCapture(event.pointerId)
}

function movePan(event: PointerEvent): void {
  if (!dragOrigin.value) return
  pan.value = {
    x: dragOrigin.value.panX + event.clientX - dragOrigin.value.pointerX,
    y: dragOrigin.value.panY + event.clientY - dragOrigin.value.pointerY,
  }
}

function stopPan(): void {
  dragOrigin.value = undefined
}

function handleWheel(event: WheelEvent): void {
  changeZoom(event.deltaY < 0 ? 0.08 : -0.08)
}

function resetGraph(): void {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

function fitGraph(): void {
  const bounds = graphCanvas.value?.getBoundingClientRect()
  if (!bounds || model.value.nodes.length === 0) {
    resetGraph()
    return
  }
  const availableWidth = Math.max(1, bounds.width - 32)
  const availableHeight = Math.max(1, bounds.height - 32)
  zoom.value = Math.min(1, availableWidth / model.value.width, availableHeight / model.value.height)
  pan.value = {
    x: Math.max(0, (bounds.width - model.value.width * zoom.value) / 2),
    y: Math.max(0, (bounds.height - model.value.height * zoom.value) / 2),
  }
}

function focusOnSelected(): void {
  graphMode.value = 'focus'
  if (!graphSelectedId.value) graphSelectedId.value = focusEntityId.value ?? ''
}

function setProjectMode(): void {
  graphMode.value = 'project'
}
</script>

<template>
  <section
    class="relationship-graph"
    aria-label="Project relationship graph"
  >
    <header class="graph-heading">
      <div>
        <p class="eyebrow">
          Project architecture
        </p>
        <h1>Relationship graph</h1>
      </div>
      <div
        class="graph-mode-tabs"
        role="group"
        aria-label="Graph scope"
      >
        <button
          type="button"
          :aria-pressed="graphMode === 'focus'"
          @click="focusOnSelected"
        >
          Focus
        </button>
        <button
          type="button"
          :aria-pressed="graphMode === 'project'"
          @click="setProjectMode"
        >
          Project
        </button>
      </div>
    </header>

    <div class="graph-toolbar">
      <details class="graph-filter-disclosure">
        <summary>Filters <span>{{ filterCount }}</span></summary>
        <div class="graph-filter-popover">
          <fieldset>
            <legend>Entity types</legend>
            <label
              v-for="kind in graphEntityKinds"
              :key="kind"
            >
              <input
                v-model="entityFilters[kind]"
                type="checkbox"
              >
              {{ entityKindLabel[kind] }}
            </label>
          </fieldset>
          <fieldset>
            <legend>Relationships</legend>
            <label
              v-for="relationship in graphRelationshipKinds"
              :key="relationship"
            >
              <input
                v-model="relationshipFilters[relationship]"
                type="checkbox"
              >
              {{ relationshipLabel(relationship) }}
            </label>
          </fieldset>
        </div>
      </details>

      <div
        v-if="graphMode === 'focus'"
        class="graph-hop-control"
        role="group"
        aria-label="Focus depth"
      >
        <span>Focus</span>
        <button
          type="button"
          :aria-pressed="focusHops === 1"
          @click="focusHops = 1"
        >
          1 hop
        </button>
        <button
          type="button"
          :aria-pressed="focusHops === 2"
          @click="focusHops = 2"
        >
          2 hops
        </button>
      </div>

      <div
        class="graph-zoom-controls"
        role="group"
        aria-label="Graph controls"
      >
        <button
          type="button"
          aria-label="Zoom out"
          @click="changeZoom(-0.15)"
        >
          −
        </button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          @click="changeZoom(0.15)"
        >
          +
        </button>
        <button
          type="button"
          @click="fitGraph"
        >
          Fit
        </button>
        <button
          type="button"
          @click="resetGraph"
        >
          Reset
        </button>
      </div>
    </div>

    <div class="graph-workspace">
      <div
        ref="graphCanvas"
        class="graph-canvas"
        :class="{ 'graph-canvas-dragging': dragOrigin }"
        @pointerdown="startPan"
        @pointermove="movePan"
        @pointerup="stopPan"
        @pointercancel="stopPan"
        @wheel.prevent="handleWheel"
      >
        <svg
          v-if="model.nodes.length"
          class="graph-svg"
          :width="model.width * zoom"
          :height="model.height * zoom"
          :viewBox="`0 0 ${model.width} ${model.height}`"
          role="group"
          aria-label="Resolved project relationships"
        >
          <defs>
            <marker
              id="graph-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" />
            </marker>
          </defs>
          <g :transform="`translate(${pan.x / zoom} ${pan.y / zoom})`">
            <g class="graph-edges">
              <g
                v-for="edge in model.edges"
                :key="edge.dependency.id"
                class="graph-edge"
                :class="{
                  'graph-edge-dimmed': !isDirectEdge(edge.source.id, edge.target.id),
                  'graph-edge-incoming': edgeDirection(edge.source.id, edge.target.id) === 'incoming',
                  'graph-edge-outgoing': edgeDirection(edge.source.id, edge.target.id) === 'outgoing',
                }"
              >
                <path
                  :d="edgePath(edge.source.id, edge.target.id)"
                  marker-end="url(#graph-arrow)"
                />
                <text
                  :x="edgeMidpoint(edge.source.id, edge.target.id).x"
                  :y="edgeMidpoint(edge.source.id, edge.target.id).y"
                  class="graph-edge-label"
                >{{ relationshipLabel(edge.dependency.relationship) }} ×{{ edge.dependency.occurrenceIds.length }}</text>
              </g>
            </g>
            <g class="graph-nodes">
              <g
                v-for="node in model.nodes"
                :key="node.entity.id"
                class="graph-node"
                :class="{
                  'graph-node-selected': graphSelectedId === node.entity.id,
                  'graph-node-neighbor': graphSelectedId !== node.entity.id && graphNeighborIds.has(node.entity.id),
                }"
                :transform="`translate(${node.position.x} ${node.position.y})`"
                :data-node-id="node.entity.id"
                role="button"
                tabindex="0"
                :aria-label="`${node.entity.name}, ${entityKindLabel[node.entity.kind]}, used by ${node.incoming} edges, uses ${node.outgoing} edges`"
                @pointerdown.stop
                @click.stop="chooseNode(node.entity.id)"
                @dblclick.stop="graphSelectedId = node.entity.id; openSelectedEntity()"
                @keydown.enter.stop.prevent="chooseNode(node.entity.id)"
                @keydown.space.stop.prevent="chooseNode(node.entity.id)"
              >
                <rect
                  width="208"
                  height="70"
                  rx="9"
                />
                <text
                  x="13"
                  y="25"
                  class="graph-node-kind"
                >{{ entityKindLabel[node.entity.kind] }}</text>
                <text
                  x="13"
                  y="49"
                  class="graph-node-name"
                >{{ node.entity.name }}</text>
                <text
                  x="195"
                  y="25"
                  class="graph-node-degree"
                >{{ node.incoming }} / {{ node.outgoing }}</text>
              </g>
            </g>
          </g>
        </svg>
        <div
          v-else
          class="graph-empty-state"
        >
          <p v-if="graphMode === 'focus'">
            Choose a connected entity, or switch to the project graph.
          </p>
          <p v-else>
            No resolved relationships match these filters.
          </p>
        </div>
      </div>

      <aside
        v-if="selectedEntity"
        class="graph-entity-panel"
        aria-label="Selected graph entity"
      >
        <p class="eyebrow">
          Selected entity
        </p>
        <h2>{{ selectedEntity.name }}</h2>
        <span class="kind-tag">{{ entityKindLabel[selectedEntity.kind] }}</span>
        <dl>
          <div><dt>Used by</dt><dd>{{ selectedEntityIncoming }}</dd></div>
          <div><dt>Uses</dt><dd>{{ selectedEntityOutgoing }}</dd></div>
        </dl>
        <button
          type="button"
          class="graph-open-entity"
          @click="openSelectedEntity"
        >
          Open entity
        </button>
      </aside>
    </div>

    <p class="graph-pan-hint">
      Edges are aggregated from resolved occurrences. Select a node to highlight direct relationships; drag to pan.
    </p>
  </section>
</template>
