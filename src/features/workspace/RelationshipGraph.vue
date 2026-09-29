<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ProjectAnalysis, RelationshipKind } from '../../core/types'
import { entityKindLabel, defaultGraphRelationshipKinds, relationshipPresentation } from './presentation'
import {
  buildGraphModel,
  graphEntityKinds,
  graphFocusEntityId as suggestedGraphFocusEntityId,
  graphKindsWithSelection,
  graphRelationshipKinds,
  type GraphEdge,
  type GraphEntityKind,
  type GraphMode,
} from './graph-model'

const props = defineProps<{
  analysis: ProjectAnalysis
  graphFocusEntityId: string | null
  rootGraph: boolean
}>()

const emit = defineEmits<{
  'open-entity': [id: string]
  'update:graphFocusEntityId': [id: string | null]
}>()

const DEFAULT_ENTITY_KINDS: readonly GraphEntityKind[] = ['eventSheet', 'function', 'object', 'family', 'layout']
const entityFilters = reactive<Record<GraphEntityKind, boolean>>({
  eventSheet: true,
  function: true,
  object: true,
  family: true,
  layout: true,
  variable: false,
  layoutLayer: false,
  layoutInstance: false,
  event: false,
  behavior: false,
  animation: false,
  animationFrame: false,
  asset: false,
  projectFolder: false,
  timeline: false,
  flowchart: false,
  addon: false,
  projectFile: false,
})
const relationshipFilters = reactive<Record<RelationshipKind, boolean>>({
  ...Object.fromEntries(graphRelationshipKinds.map((kind) => [kind, defaultGraphRelationshipKinds.includes(kind)])),
} as Record<RelationshipKind, boolean>)
const graphMode = ref<GraphMode>(props.rootGraph ? 'project' : 'focus')
const focusHops = ref<1 | 2>(1)
const graphSelectedId = ref(props.graphFocusEntityId
  ?? suggestedGraphFocusEntityId(props.analysis, DEFAULT_ENTITY_KINDS)
  ?? '')
const graphSelectionExplicit = ref(Boolean(props.graphFocusEntityId))
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const graphCanvas = ref<HTMLElement | null>(null)
const dragOrigin = ref<{ pointerX: number; pointerY: number; panX: number; panY: number }>()

const initiallySelectedEntity = props.analysis.index.byId.get(props.graphFocusEntityId ?? '')
if (initiallySelectedEntity && graphEntityKinds.includes(initiallySelectedEntity.kind as GraphEntityKind)) {
  entityFilters[initiallySelectedEntity.kind as GraphEntityKind] = true
}

const selectedKinds = computed(() => graphEntityKinds.filter((kind) => entityFilters[kind]))
const selectedRelationships = computed(() => graphRelationshipKinds.filter((kind) => relationshipFilters[kind]))
const focusEntityId = computed(() => {
  const selected = graphSelectedId.value
  if (selected) return selected
  return suggestedGraphFocusEntityId(props.analysis, selectedKinds.value)
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
  ? model.value.edges.filter((edge) => edge.target.id === selectedEntity.value?.id).length
  : 0)
const selectedEntityOutgoing = computed(() => selectedEntity.value
  ? model.value.edges.filter((edge) => edge.source.id === selectedEntity.value?.id).length
  : 0)
const filterCount = computed(() => selectedKinds.value.length + selectedRelationships.value.length)

watch([() => props.graphFocusEntityId, () => props.rootGraph], ([entityId, rootGraph]) => {
  const restoredEntityId = entityId
    ?? suggestedGraphFocusEntityId(props.analysis, selectedKinds.value)
    ?? ''
  graphSelectedId.value = restoredEntityId
  graphSelectionExplicit.value = Boolean(entityId)
  const entity = props.analysis.index.byId.get(restoredEntityId)
  if (entity) enableSelectedKind(entity.kind)
  graphMode.value = rootGraph ? 'project' : 'focus'
})

watch([graphMode, graphSelectedId, selectedKinds], () => {
  if (graphMode.value !== 'focus') return
  const entity = props.analysis.index.byId.get(graphSelectedId.value)
  if (entity) enableSelectedKind(entity.kind)
})

watch(() => props.analysis, (analysis) => {
  graphSelectedId.value = props.graphFocusEntityId
    ?? suggestedGraphFocusEntityId(analysis, DEFAULT_ENTITY_KINDS)
    ?? ''
  graphSelectionExplicit.value = Boolean(props.graphFocusEntityId)
  graphMode.value = props.rootGraph ? 'project' : 'focus'
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
})

function chooseNode(entityId: string): void {
  graphSelectedId.value = entityId
  graphSelectionExplicit.value = true
  emit('update:graphFocusEntityId', entityId)
}

function enableSelectedKind(kind: Parameters<typeof graphKindsWithSelection>[1]): void {
  for (const selectedKind of graphKindsWithSelection(selectedKinds.value, kind)) {
    entityFilters[selectedKind] = true
  }
}

function openSelectedEntity(): void {
  if (selectedEntity.value) emit('open-entity', selectedEntity.value.id)
}

function relationshipLabel(relationship: RelationshipKind): string {
  return relationshipPresentation(relationship).graphLabel
}

function edgePath(edge: GraphEdge): string {
  const source = graphPositions.value.get(edge.source.id)
  const target = graphPositions.value.get(edge.target.id)
  if (!source || !target) return ''
  const nodeWidth = 208
  const nodeHeight = 70
  const sourceCenterY = source.y + nodeHeight / 2
  const targetCenterY = target.y + nodeHeight / 2

  if (source.x === target.x) {
    const direction = targetCenterY >= sourceCenterY ? 1 : -1
    const sourceY = source.y + (direction > 0 ? nodeHeight : 0)
    const targetY = target.y + (direction > 0 ? 0 : nodeHeight)
    const side = source.x + nodeWidth + 44 + edge.routeLane * 20
    return `M ${source.x + nodeWidth} ${sourceY} C ${side} ${sourceY}, ${side} ${targetY}, ${target.x + nodeWidth} ${targetY}`
  }

  const forward = target.x > source.x
  const startX = source.x + (forward ? nodeWidth : 0)
  const endX = target.x + (forward ? 0 : nodeWidth)
  const middleX = (startX + endX) / 2
  return `M ${startX} ${sourceCenterY} C ${middleX} ${sourceCenterY}, ${middleX} ${targetCenterY}, ${endX} ${targetCenterY}`
}

function edgeMidpoint(edge: GraphEdge): { x: number; y: number } {
  const source = graphPositions.value.get(edge.source.id)
  const target = graphPositions.value.get(edge.target.id)
  if (!source || !target) return { x: 0, y: 0 }
  if (source.x === target.x) {
    return {
      x: source.x + 208 + 48 + edge.routeLane * 20,
      y: (source.y + target.y + 70) / 2 - 12,
    }
  }
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
  if (graphSelectedId.value) emit('update:graphFocusEntityId', graphSelectedId.value)
}

function setProjectMode(): void {
  graphMode.value = 'project'
  if (props.graphFocusEntityId) emit('update:graphFocusEntityId', null)
}
</script>

<template>
  <section
    class="relationship-graph min-w-0 px-5 pt-[18px] pb-[22px] max-[760px]:px-3 max-[760px]:pt-4 max-[760px]:pb-5"
    aria-label="Project relationship graph"
  >
    <header class="graph-heading flex items-center justify-between gap-[14px] max-[760px]:items-start max-[760px]:flex-col">
      <div>
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          {{ rootGraph ? 'Project architecture' : 'Focused project view' }}
        </p>
        <h1 class="m-0 text-xl font-semibold text-text">
          Relationship graph
        </h1>
      </div>
      <div
        class="graph-mode-tabs flex gap-1 rounded-[7px] border border-line bg-[#101922] p-[3px]"
        role="group"
        aria-label="Graph scope"
      >
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-transparent bg-transparent px-2 py-[5px] text-[11px] text-text-muted aria-[pressed=true]:border-[#465b42] aria-[pressed=true]:bg-[#202c27] aria-[pressed=true]:text-accent"
          type="button"
          :aria-pressed="graphMode === 'focus'"
          @click="focusOnSelected"
        >
          Focus
        </button>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-transparent bg-transparent px-2 py-[5px] text-[11px] text-text-muted aria-[pressed=true]:border-[#465b42] aria-[pressed=true]:bg-[#202c27] aria-[pressed=true]:text-accent"
          type="button"
          :aria-pressed="graphMode === 'project'"
          @click="setProjectMode"
        >
          Project
        </button>
      </div>
    </header>

    <div class="graph-toolbar relative z-[2] my-[13px] mb-[10px] flex flex-wrap gap-[9px]">
      <details class="graph-filter-disclosure group relative">
        <summary class="flex min-h-[29px] cursor-pointer list-none items-center gap-2 rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted focus-visible:outline-2 focus-visible:outline-accent">
          Filters <span class="tabular-nums text-accent">{{ filterCount }}</span>
        </summary>
        <div class="graph-filter-popover absolute top-[calc(100%+6px)] left-0 z-10 grid w-[min(500px,calc(100vw-40px))] grid-cols-2 gap-3 rounded-lg border border-line bg-[#141e27] p-3 shadow-[0_12px_28px_rgb(0_0_0_/_35%)] max-[420px]:grid-cols-1">
          <fieldset class="grid min-w-0 gap-[6px] border-0 p-0 m-0">
            <legend class="mb-[7px] text-[11px] font-semibold text-text">
              Entity types
            </legend>
            <label
              v-for="kind in graphEntityKinds"
              :key="kind"
              class="flex items-center gap-[7px] text-[11px] text-text-muted"
            >
              <input
                v-model="entityFilters[kind]"
                type="checkbox"
                class="accent-accent"
              >
              {{ entityKindLabel[kind] }}
            </label>
          </fieldset>
          <fieldset class="grid min-w-0 gap-[6px] border-0 p-0 m-0">
            <legend class="mb-[7px] text-[11px] font-semibold text-text">
              Relationships
            </legend>
            <label
              v-for="relationship in graphRelationshipKinds"
              :key="relationship"
              class="flex items-center gap-[7px] text-[11px] text-text-muted"
            >
              <input
                v-model="relationshipFilters[relationship]"
                type="checkbox"
                class="accent-accent"
              >
              {{ relationshipLabel(relationship) }}
            </label>
          </fieldset>
        </div>
      </details>

      <div
        v-if="graphMode === 'focus'"
        class="graph-hop-control flex items-center gap-1 text-[11px] text-text-dim"
        role="group"
        aria-label="Focus depth"
      >
        <span>Focus</span>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted aria-[pressed=true]:border-[#465b42] aria-[pressed=true]:bg-[#202c27] aria-[pressed=true]:text-accent"
          type="button"
          :aria-pressed="focusHops === 1"
          @click="focusHops = 1"
        >
          1 hop
        </button>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted aria-[pressed=true]:border-[#465b42] aria-[pressed=true]:bg-[#202c27] aria-[pressed=true]:text-accent"
          type="button"
          :aria-pressed="focusHops === 2"
          @click="focusHops = 2"
        >
          2 hops
        </button>
      </div>

      <div
        class="graph-zoom-controls ml-auto flex items-center gap-1 max-[760px]:ml-0"
        role="group"
        aria-label="Graph controls"
      >
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted"
          type="button"
          aria-label="Zoom out"
          @click="changeZoom(-0.15)"
        >
          −
        </button>
        <span class="min-w-[42px] text-center text-[10px] text-text-dim">{{ Math.round(zoom * 100) }}%</span>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted"
          type="button"
          aria-label="Zoom in"
          @click="changeZoom(0.15)"
        >
          +
        </button>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted"
          type="button"
          @click="fitGraph"
        >
          Fit
        </button>
        <button
          class="min-h-[29px] cursor-pointer rounded-[5px] border border-line bg-transparent px-2 py-[5px] text-[11px] text-text-muted"
          type="button"
          @click="resetGraph"
        >
          Reset
        </button>
      </div>
    </div>

    <div class="graph-workspace grid min-w-0 grid-cols-[minmax(0,1fr)_220px] gap-3 max-[760px]:grid-cols-1">
      <div
        ref="graphCanvas"
        class="graph-canvas min-h-[420px] max-h-[min(70vh,680px)] min-w-0 cursor-grab touch-pan-x touch-pan-y overflow-auto rounded-[9px] border border-line bg-[#101922] bg-[radial-gradient(#33424d_.6px,transparent_.6px)] bg-[length:18px_18px] bg-[position:8px_8px] max-[760px]:max-h-[58vh] max-[760px]:min-h-[350px]"
        :class="{ 'graph-canvas-dragging cursor-grabbing select-none': dragOrigin }"
        @pointerdown="startPan"
        @pointermove="movePan"
        @pointerup="stopPan"
        @pointercancel="stopPan"
        @wheel.prevent="handleWheel"
      >
        <svg
          v-if="model.nodes.length"
          class="graph-svg block overflow-visible"
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
              <path
                class="fill-[#71818a]"
                d="M0,0 L8,4 L0,8 z"
              />
            </marker>
          </defs>
          <g :transform="`translate(${pan.x / zoom} ${pan.y / zoom})`">
            <g class="graph-edges">
              <g
                v-for="edge in model.edges"
                :key="edge.dependency.id"
                class="graph-edge"
                :class="{
                  'opacity-20': !isDirectEdge(edge.source.id, edge.target.id),
                }"
              >
                <path
                  class="fill-none stroke-[#61727e] stroke-[1.7]"
                  :d="edgePath(edge)"
                  marker-end="url(#graph-arrow)"
                  :class="{ 'stroke-accent stroke-[2.5]': edgeDirection(edge.source.id, edge.target.id) !== 'other' }"
                />
                <text
                  :x="edgeMidpoint(edge).x"
                  :y="edgeMidpoint(edge).y"
                  class="graph-edge-label fill-text text-[10px] [paint-order:stroke] stroke-[#101922] stroke-[5px] [stroke-linejoin:round]"
                >{{ relationshipLabel(edge.dependency.relationship) }} ×{{ edge.dependency.occurrenceIds.length }}</text>
              </g>
            </g>
            <g class="graph-nodes">
              <g
                v-for="node in model.nodes"
                :key="node.entity.id"
                class="graph-node group cursor-pointer [&>rect]:fill-[#18242e] [&>rect]:stroke-[#42535f] [&>rect]:stroke-[1.3] hover:[&>rect]:stroke-[#a9bd78] hover:[&>rect]:stroke-2 focus-visible:[&>rect]:stroke-[#a9bd78] focus-visible:[&>rect]:stroke-2"
                :class="{
                  '[&>rect]:fill-[#202b28] [&>rect]:stroke-accent [&>rect]:stroke-[2.3]': graphSelectedId === node.entity.id,
                  '[&>rect]:stroke-[#83936b]': graphSelectedId !== node.entity.id && graphNeighborIds.has(node.entity.id),
                }"
                :transform="`translate(${node.position.x} ${node.position.y})`"
                :data-node-id="node.entity.id"
                role="button"
                tabindex="0"
                :aria-label="`${node.entity.name}, ${entityKindLabel[node.entity.kind]}, ${node.incoming} incoming dependency edges, ${node.outgoing} outgoing dependency edges`"
                @pointerdown.stop
                @click.stop="chooseNode(node.entity.id)"
                @dblclick.stop="chooseNode(node.entity.id); openSelectedEntity()"
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
                  class="graph-node-kind fill-text-dim text-[10px]"
                >{{ entityKindLabel[node.entity.kind] }}</text>
                <text
                  x="13"
                  y="49"
                  class="graph-node-name fill-text text-[13px] font-semibold"
                >{{ node.entity.name }}</text>
                <text
                  x="195"
                  y="25"
                  class="graph-node-degree fill-text-dim text-[10px] text-right [text-anchor:end]"
                >↓{{ node.incoming }} ↑{{ node.outgoing }}</text>
              </g>
            </g>
          </g>
        </svg>
        <div
          v-else
          class="graph-empty-state grid min-h-[420px] place-items-center px-5 py-5 text-center text-xs text-text-muted"
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
        class="graph-entity-panel min-w-0 self-start rounded-[9px] border border-line bg-[#141e27] p-[14px] max-[760px]:grid max-[760px]:grid-cols-[1fr_auto] max-[760px]:items-start max-[760px]:gap-x-3 max-[760px]:gap-y-[6px]"
        aria-label="Selected graph entity"
      >
        <p class="eyebrow mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-text-dim">
          Selected entity
        </p>
        <h2 class="m-0 mb-2 break-words text-[15px] text-text max-[760px]:col-span-2">
          {{ selectedEntity.name }}
        </h2>
        <span class="kind-tag mt-[7px] inline-flex rounded-[3px] border border-[#405044] px-[6px] py-[3px] text-[10px] font-medium text-accent max-[760px]:col-span-2">{{ entityKindLabel[selectedEntity.kind] }}</span>
        <dl class="my-[14px] grid grid-cols-2 gap-[9px] max-[760px]:col-span-2">
          <div class="border-t border-line-soft pt-2">
            <dt class="text-[10px] text-text-dim">
              Incoming edges
            </dt><dd class="mt-0.5 mb-0 text-sm font-semibold text-text">
              {{ selectedEntityIncoming }}
            </dd>
          </div>
          <div class="border-t border-line-soft pt-2">
            <dt class="text-[10px] text-text-dim">
              Outgoing edges
            </dt><dd class="mt-0.5 mb-0 text-sm font-semibold text-text">
              {{ selectedEntityOutgoing }}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          class="graph-open-entity min-h-[34px] w-full cursor-pointer rounded-md border border-[#465b42] bg-[#202c27] text-xs font-semibold text-accent max-[760px]:col-span-2"
          @click="openSelectedEntity"
        >
          Open entity
        </button>
      </aside>
    </div>

    <p class="graph-pan-hint mt-2 mb-0 text-[10px] text-text-dim">
      Node numbers show incoming/outgoing dependency edges; edge labels show occurrence counts. Drag to pan.
    </p>
  </section>
</template>
