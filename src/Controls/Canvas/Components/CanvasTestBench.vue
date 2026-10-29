<template>
  <BlockShell>
    <div class="test-bench">
      <v-tabs v-model="tab" density="compact" bg-color="transparent" show-arrows>
        <v-tab value="state">状态</v-tab>
        <v-tab value="config">配置</v-tab>
        <v-tab value="files">文件</v-tab>
        <v-tab value="scroll">滚动</v-tab>
        <v-tab value="colors">颜色</v-tab>
      </v-tabs>

      <v-window v-model="tab" class="bench-window">
        <v-window-item value="state">
          <div class="bench-pane">
            <div class="bench-uuid">
              <b>uuid</b>
              <code data-test="block-uuid">{{ ctx.uuid }}</code>
            </div>

            <div class="bench-metrics">
              <span><b>尺寸</b> {{ size.w }}×{{ size.h }}</span>
              <span><b>readOnly</b> {{ ctx.readOnly }}</span>
              <span><b>compact</b> {{ ctx.isCompact }}</span>
              <span><b>active</b> {{ ctx.isActive }}</span>
            </div>

            <div v-if="config.showViewport !== false" class="bench-metrics">
              <span><b>view</b> {{ viewLabel }}</span>
              <span><b>origin</b> {{ viewLabel ? originLabel : '—' }}</span>
              <span><b>isPanning</b> {{ panningLabel }}</span>
            </div>

            <div class="bench-actions">
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(moveBlock)">
                moveBy(+40, 0)
              </v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(growWidth)">
                resizeTo(width +40)
              </v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(growHeight)">
                resizeTo(height +40)
              </v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(panCanvas)">
                panBy(+60, 0)
              </v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(cycleZoom)">
                zoom 循环
              </v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="runStep(resetView)">
                重置视图
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="refreshView">刷新视图</v-btn>
            </div>
          </div>
        </v-window-item>

        <v-window-item value="config">
          <div class="bench-pane">
            <div class="bench-row">
              <span>config.counter = {{ config.counter }}</span>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="bumpCounter">+1</v-btn>
            </div>
            <v-text-field :model-value="config.note" label="config.note（同时改拖拽栏标题）" density="compact"
              variant="outlined" hide-details :readonly="ctx.readOnly" @update:model-value="onNoteInput" />
            <div class="bench-hint">note 变化会驱动 titleOf，拖拽栏标题应同步变化。</div>
          </div>
        </v-window-item>

        <v-window-item value="files">
          <div class="bench-pane">
            <v-text-field v-model="dataPath" label="相对路径" density="compact" variant="outlined" hide-details
              :readonly="ctx.readOnly" />
            <v-textarea v-model="dataContent" label="内容" rows="2" density="compact" variant="outlined" hide-details
              :readonly="ctx.readOnly" />
            <div class="bench-actions">
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="writeData">写入</v-btn>
              <v-btn size="x-small" variant="tonal" @click="readData">读取</v-btn>
              <v-btn size="x-small" variant="tonal" @click="listData">列出</v-btn>
              <v-btn size="x-small" variant="tonal" :disabled="ctx.readOnly" @click="deleteData">删除</v-btn>
            </div>
            <div class="bench-status" data-test="component-data-status">{{ dataStatus }}</div>
            <div v-if="dataFiles.length" class="bench-status">{{ dataFiles.join(' · ') }}</div>
          </div>
        </v-window-item>

        <v-window-item value="scroll">
          <div class="bench-pane scroll-pane">
            <div v-for="row in SCROLL_ROWS" :key="row">滚动测试行 {{ row }}</div>
          </div>
        </v-window-item>

        <v-window-item value="colors">
          <div class="bench-pane">
            <div class="bench-actions">
              <v-chip v-for="role in PREVIEW_ROLES" :key="role" size="x-small" :color="role" label>{{ role }}</v-chip>
            </div>
            <v-progress-linear :model-value="PREVIEW_PROGRESS" color="secondary"
              bg-color="rgba(var(--v-theme-on-background), 0.14)" height="4" rounded />
            <div class="bench-metrics">
              <div v-for="item in themeColors" :key="item.key" class="color-cell">
                <span class="color-swatch" :style="{ background: item.css }" />
                <code class="color-key">{{ item.key }}</code>
                <span class="color-value">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </v-window-item>
      </v-window>
    </div>

    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-switch :model-value="config.showViewport !== false" color="primary" hide-details label="显示视图数据"
            :disabled="ctx.readOnly" @update:model-value="onShowViewportToggle" />
        </v-list-item>
      </v-list>
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useTheme } from 'vuetify'

import { getErrorMessage } from '../../../utils/getErrorMessage.ts'
import type { TestBenchConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'

const MOVE_STEP = 40
const RESIZE_STEP = 40
const PAN_STEP = 60
const ZOOM_PRESETS = [0.5, 1, 2, 3]
const DATA_TEST_PATH = 'test/hello.txt'
const DATA_TEST_CONTENT = 'hello mdrfcd'
const DATA_TEST_IDLE = '未测试'
const SCROLL_ROWS = Array.from({ length: 60 }, (_, index) => index + 1)
const PREVIEW_ROLES = ['primary', 'secondary', 'success', 'warning', 'info', 'error'] as const
const PREVIEW_PROGRESS = 60

const ctx = useBlockContext<TestBenchConfig>()
const config = computed(() => ctx.config)
const size = computed(() => ctx.getSize())

const tab = ref('state')
const viewLabel = ref('')
const originLabel = ref('')
const panningLabel = ref('')

const theme = useTheme()
const themeColors = computed(() =>
  Object.entries(theme.current.value.colors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      css: `rgb(var(--v-theme-${key}))`,
    })),
)

const refreshView = () => {
  const view = ctx.getView()
  viewLabel.value = `z${view.zoom} pan(${Math.round(view.pan.x)},${Math.round(view.pan.y)})`
  originLabel.value = `${Math.round(view.origin.x)},${Math.round(view.origin.y)}`
  panningLabel.value = String(view.isPanning)
}

const runStep = async (step: () => void | Promise<void>) => {
  await step()
  await nextTick()
  refreshView()
}

const moveBlock = () => ctx.moveBy(MOVE_STEP, 0)

const growWidth = () => ctx.resizeTo({ w: ctx.getSize().w + RESIZE_STEP })

const growHeight = () => ctx.resizeTo({ h: ctx.getSize().h + RESIZE_STEP })

const panCanvas = () => ctx.panBy(PAN_STEP, 0)

const cycleZoom = () => {
  const current = ctx.getView().zoom
  const next = ZOOM_PRESETS.find((preset) => preset > current) ?? ZOOM_PRESETS[0]
  ctx.zoomTo(next)
}

// 缩放会触发画布锚点补偿改写 pan，所以要等它落定后再归零平移
const resetView = async () => {
  ctx.zoomTo(1)
  await nextTick()
  const { pan } = ctx.getView()
  ctx.panBy(-pan.x, -pan.y)
}

const bumpCounter = () => {
  ctx.setConfig({ counter: (config.value.counter ?? 0) + 1 })
}

const onNoteInput = (value: unknown) => {
  ctx.setConfig({ note: String(value ?? '') })
}

const onShowViewportToggle = (value: unknown) => {
  ctx.setConfig({ showViewport: value === true })
}

const dataPath = ref(DATA_TEST_PATH)
const dataContent = ref(DATA_TEST_CONTENT)
const dataStatus = ref(DATA_TEST_IDLE)
const dataFiles = ref<string[]>([])

// 点击回调就是错误边界，失败只写状态行，不打断整个块
const runDataStep = async (step: () => Promise<string>) => {
  try {
    dataStatus.value = await step()
  } catch (error) {
    dataStatus.value = getErrorMessage(error)
  }
}

const writeData = () => runDataStep(async () => {
  await ctx.files.write(dataPath.value, dataContent.value)
  return `已写入 ${dataPath.value}`
})

const readData = () => runDataStep(async () => {
  dataContent.value = await ctx.files.readText(dataPath.value)
  return `已读取 ${dataPath.value}`
})

const listData = () => runDataStep(async () => {
  dataFiles.value = await ctx.files.list()
  return `共 ${dataFiles.value.length} 个文件`
})

const deleteData = () => runDataStep(async () => {
  await ctx.files.remove(dataPath.value)
  return `已删除 ${dataPath.value}`
})
</script>

<style scoped>
.test-bench {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--v-theme-on-surface);
}

.bench-window {
  flex: 1;
  min-height: 0;
}

.bench-window :deep(.v-window__container),
.bench-window :deep(.v-window-item) {
  height: 100%;
}

.bench-pane {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
  overflow: auto;
  font-size: 12px;
}

.scroll-pane {
  overflow: auto;
}

.bench-row,
.bench-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.bench-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
}

.bench-uuid {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
}

.bench-uuid code {
  overflow-wrap: anywhere;
  user-select: text;
}

.bench-hint,
.bench-status {
  font-size: 11px;
  opacity: 0.8;
  overflow-wrap: anywhere;
}

.color-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.color-swatch {
  flex: none;
  width: 18px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
}

.color-key {
  flex: none;
  min-width: 96px;
}

.color-value {
  opacity: 0.7;
  overflow-wrap: anywhere;
}
</style>
