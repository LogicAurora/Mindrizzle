<template>
  <MdrCanvasComponentBase ref="baseRef" v-bind="props.base" :icon="mdiFlaskOutline" :title="TEST_BENCH_LABEL"
    :width-changable="props.base.compact !== true">
    <div v-if="!virtualized" class="test-bench inner-component">
      <div class="bench-status">
        <v-chip size="x-small" color="primary" variant="tonal">{{ TEST_BENCH_LABEL }}</v-chip>
        <v-chip size="x-small" :color="props.base.active ? 'success' : 'default'">
          active: {{ props.base.active }}
        </v-chip>
        <v-chip size="x-small" :color="props.base.readOnly ? 'warning' : 'default'">
          readOnly: {{ props.base.readOnly }}
        </v-chip>
        <v-chip size="x-small" :color="props.base.popupOpen ? 'info' : 'default'">
          popup: {{ props.base.popupOpen }}
        </v-chip>
      </div>

      <div v-if="showViewport" class="bench-metrics">
        <span v-for="metric in metrics" :key="metric.label">
          <b>{{ metric.label }}</b> {{ metric.value }}
        </span>
      </div>

      <div class="bench-actions">
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(moveBlock)">
          moveBy(+40, 0)
        </v-btn>
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(growWidth)">
          resizeTo(width +40)
        </v-btn>
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(growHeight)">
          resizeTo(height +40)
        </v-btn>
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(panCanvas)">
          panBy(+60, 0)
        </v-btn>
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(cycleZoom)">
          zoom 循环
        </v-btn>
        <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="runStep(resetView)">
          重置视图
        </v-btn>
        <v-btn size="x-small" variant="outlined" @click="refreshViewModel">刷新数据</v-btn>
      </div>

      <div class="bench-config">
        <div class="bench-counter">
          <span>config.counter = {{ counter }}</span>
          <v-btn size="x-small" variant="tonal" :disabled="props.base.readOnly" @click="bumpCounter">
            updateConfig +1
          </v-btn>
        </div>
        <v-text-field :model-value="note" label="config.note（writeConfig）" density="compact" variant="outlined"
          hide-details :readonly="props.base.readOnly" @update:model-value="onNoteInput" />
      </div>

      <div class="bench-scroll">
        <div v-for="row in SCROLL_ROWS" :key="row">滚动测试行 {{ row }}</div>
      </div>
    </div>
    <div v-else class="virtual-snapshot inner-component" v-html="snapshot" />

    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-switch :model-value="showViewport" color="primary" hide-details label="显示视图数据"
            @update:model-value="onShowViewportToggle" />
        </v-list-item>
      </v-list>
    </template>
  </MdrCanvasComponentBase>
</template>

<script lang="ts">
export const TEST_BENCH_LABEL = '测试台'
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { mdiFlaskOutline } from '@mdi/js'

import MdrCanvasComponentBase from '../MdrCanvasComponentBase.vue'
import type { MdrCanvasComponentContentProps } from '../MdrCanvasComponentBase.types.ts'
import type {
  BlockCanvasController,
  BlockComponentController,
  CanvasViewData,
  SizeChangeable,
} from '../canvasComponentControllers.ts'
import type { TestBenchConfig } from '../canvasComponents.ts'

const props = defineProps<MdrCanvasComponentContentProps<TestBenchConfig> & {
  virtualized?: boolean
  snapshot?: string
}>()

const MOVE_STEP = 40
const RESIZE_STEP = 40
const PAN_STEP = 60
const ZOOM_PRESETS = [0.5, 1, 2, 3]
const SCROLL_ROWS = Array.from({ length: 60 }, (_, index) => index + 1)

interface BaseExposed {
  controller: BlockComponentController
  canvasController: BlockCanvasController
}

const baseRef = ref<BaseExposed | null>(null)
const config = computed(() => props.config as TestBenchConfig)
const counter = ref(config.value.counter ?? 0)
const note = ref(config.value.note ?? '')
const showViewport = ref(config.value.showViewport !== false)
const sizeSnapshot = ref({ width: 0, height: 0 })
const changeableSnapshot = ref<SizeChangeable>({ width: true, height: true })
const viewSnapshot = ref<CanvasViewData | null>(null)

const metrics = computed(() => {
  const view = viewSnapshot.value
  return [
    { label: 'pos', value: `${Math.round(props.base.x)},${Math.round(props.base.y)}` },
    { label: 'size', value: `${Math.round(props.base.width)}×${Math.round(props.base.height)}` },
    { label: 'getSize', value: `${Math.round(sizeSnapshot.value.width)}×${Math.round(sizeSnapshot.value.height)}` },
    { label: 'getChangeable', value: `${changeableSnapshot.value.width}/${changeableSnapshot.value.height}` },
    { label: 'view', value: view ? `z${view.zoom} pan(${Math.round(view.pan.x)},${Math.round(view.pan.y)})` : '未刷新' },
    { label: 'origin', value: view ? `${Math.round(view.origin.x)},${Math.round(view.origin.y)}` : '—' },
    { label: 'viewport', value: view?.viewport ? '有' : '无' },
    { label: 'isPanning', value: view ? String(view.isPanning) : '—' },
    { label: 'handles', value: props.base.handles?.join(',') || '无' },
    { label: 'zIndex', value: String(props.base.zIndex) },
    { label: 'placement', value: props.base.placement },
    { label: 'masks', value: String(props.base.masks?.length ?? 0) },
    { label: 'compact', value: String(props.base.compact) },
  ]
})

const refreshViewModel = () => {
  const base = baseRef.value
  if (!base) return
  sizeSnapshot.value = base.controller.getSize()
  changeableSnapshot.value = base.controller.getChangeable()
  viewSnapshot.value = base.canvasController.getViewData()
}

const runStep = async (step: () => void | Promise<void>) => {
  await step()
  await nextTick()
  refreshViewModel()
}

const moveBlock = () => baseRef.value?.controller.moveBy(MOVE_STEP, 0)

const growWidth = () => {
  const controller = baseRef.value?.controller
  if (!controller) return
  controller.resizeTo({ width: controller.getSize().width + RESIZE_STEP })
}

const growHeight = () => {
  const controller = baseRef.value?.controller
  if (!controller) return
  controller.resizeTo({ height: controller.getSize().height + RESIZE_STEP })
}

const panCanvas = () => baseRef.value?.canvasController.panBy(PAN_STEP, 0)

const cycleZoom = () => {
  const canvasController = baseRef.value?.canvasController
  if (!canvasController) return
  const current = canvasController.getViewData().zoom
  const next = ZOOM_PRESETS.find((preset) => preset > current) ?? ZOOM_PRESETS[0]
  canvasController.zoomTo(next)
}

// 缩放会触发画布锚点补偿改写 pan，所以要等它落定后再归零平移
const resetView = async () => {
  const canvasController = baseRef.value?.canvasController
  if (!canvasController) return
  canvasController.zoomTo(1)
  await nextTick()
  const { pan } = canvasController.getViewData()
  canvasController.panBy(-pan.x, -pan.y)
}

const bumpCounter = () => {
  counter.value += 1
  props.base.handlers.updateConfig({ counter: counter.value })
}

const onNoteInput = (value: unknown) => {
  note.value = String(value ?? '')
  props.base.handlers.writeConfig({ note: note.value })
}

const onShowViewportToggle = (value: unknown) => {
  showViewport.value = !!value
  props.base.handlers.updateConfig({ showViewport: showViewport.value })
}

const onCanvasTransform = () => refreshViewModel()

onMounted(() => {
  refreshViewModel()
  window.addEventListener('Mindrizzle:canvas-transform', onCanvasTransform)
})

onBeforeUnmount(() => {
  window.removeEventListener('Mindrizzle:canvas-transform', onCanvasTransform)
})

defineExpose({
  saveConfig: () => ({ counter: counter.value, note: note.value, showViewport: showViewport.value }),
  loadConfig: (next: Partial<TestBenchConfig>) => {
    if (next.counter != null) counter.value = next.counter
    if (next.note != null) note.value = next.note
    if (next.showViewport != null) showViewport.value = next.showViewport
  },
})
</script>

<style scoped>
/* 快照是克隆的组件 DOM，用 display:contents 让它直接充当 .content-area 的 flex 子项 */
.virtual-snapshot {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会吞掉指针事件，所以整棵子树穿透 */
.virtual-snapshot :deep(*) {
  pointer-events: none !important;
}

.test-bench {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--v-theme-on-surface);
}

.bench-status,
.bench-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.bench-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
}

.bench-config {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bench-counter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.bench-scroll {
  flex: 1;
  min-height: 70px;
  overflow: auto;
  padding: 4px 6px;
  font-size: 11px;
  line-height: 1.6;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 4px;
}
</style>
