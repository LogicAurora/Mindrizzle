<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible" class="format-mode-picker" :class="{ 'is-popup-open': isPopupOpen }"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      @pointerenter="isAnchorHovered = true" @pointerleave="isAnchorHovered = false"
      @pointerdown.stop @mousedown.stop @click.stop>
      <Transition name="mode-wheel" :css="!isGridVisible">
        <v-sheet v-if="isExpanded" class="format-mode-wheel"
          color="surface" elevation="8" rounded="md" border
          :style="{ '--mode-wheel-width': `${wheelWidth}px` }">
          <TransitionGroup name="mode-roll" tag="div" class="format-mode-track"
            :class="rollDirection === 1 ? 'roll-down' : 'roll-up'">
            <div v-for="(mode, row) in wheelRows" :key="mode.label" class="format-mode-row text-body-2"
              :class="row === CURRENT_ROW ? 'text-primary font-weight-medium' : 'text-medium-emphasis'">
              <span>{{ mode.label }}</span>
              <v-icon :icon="mode.icon" size="20"
                :style="{ visibility: row === CURRENT_ROW && !isExpanded ? 'hidden' : 'visible' }" />
            </div>
          </TransitionGroup>
        </v-sheet>
      </Transition>
      <Transition name="mode-grid" :css="!isExpanded">
        <v-sheet v-if="isGridVisible" class="format-mode-grid"
          color="surface" elevation="8" rounded="md" border
          :style="{ '--mode-grid-height': `${gridHeight}px` }">
          <v-tooltip v-for="(mode, index) in modes" :key="mode.label" location="start"
            :open-delay="0" :close-delay="0">
            <template #activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" class="format-mode-grid-item" icon variant="text"
                :color="index === modelValue ? 'primary' : undefined"
                @click="emit('update:modelValue', index)">
                <v-icon :icon="mode.icon" size="20" />
              </v-btn>
            </template>
            <div class="text-body-2 font-weight-medium">{{ mode.label }}</div>
            <div class="text-caption mode-tip-desc">{{ mode.description }}</div>
          </v-tooltip>
        </v-sheet>
      </Transition>
      <v-sheet class="format-mode-anchor" rounded="md" border>
        <v-icon v-if="!isExpanded" :icon="currentMode.icon" size="20" color="primary" />
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { Z_LAYER } from '../../Core/zIndex.ts'
import type { FormatMode } from './formatModes.ts'

const props = defineProps<{
  modes: readonly FormatMode[]
  modelValue: number
  visible: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', index: number): void }>()

// 触摸板一次滑动会连发几十个 wheel，40ms 内视为同一手势，保证一格一格地滚
const WHEEL_GESTURE_MS = 40
const ROW_COUNT = 3
// 三行固定为上一 / 当前 / 下一，中行即当前模式
const CURRENT_ROW = 1
const GRID_COLUMNS = 2
const GRID_ROW_HEIGHT = 36
const GRID_GAP = 2
// 与 .format-mode-grid 的 padding 保持一致
const GRID_PADDING = 4
const GRID_MAX_ROWS = 3
const WHEEL_CHAR_WIDTH = 14
const WHEEL_ICON_SIZE = 20
const WHEEL_GAP = 10
const WHEEL_PADDING_LEFT = 12
// 图标中心要压在锚点中心上：边框 1 + 右侧内边距 7 + 半个图标 10
const WHEEL_PADDING_RIGHT = 7
const WHEEL_BORDER_WIDTH = 2
const WHEEL_WIDTH_SLACK = 4

const isAltDown = ref(false)
// 开始框选/点选时立即收起，避免弹窗盖住正在选中的文字；松开 Alt 后复位
const isDismissed = ref(false)
const isAnchorHovered = ref(false)
const rollDirection = ref<1 | -1>(1)
let lastWheelAt = 0

const isExpanded = computed(() => props.visible && isAltDown.value && !isDismissed.value)
// 悬浮图标面板与 Alt 轮盘互斥，避免同时压在锚点位置
const isGridVisible = computed(() => props.visible && isAnchorHovered.value && !isExpanded.value)
// 任一弹窗展开时由弹窗边框接管锚点描边，避免两条 1px 边框叠成更粗的线
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value)
const currentMode = computed(() => props.modes[props.modelValue] ?? props.modes[0])

const wrapIndex = (index: number) => ((index % props.modes.length) + props.modes.length) % props.modes.length

// 弹窗固定三行：上一模式 / 当前模式 / 下一模式，循环取模
const wheelRows = computed(() =>
  Array.from({ length: ROW_COUNT }, (_, row) => props.modes[wrapIndex(props.modelValue + row - 1)]),
)

// 悬浮面板按图标数量自适应高度，最多三行
const gridRows = computed(() => Math.min(GRID_MAX_ROWS, Math.ceil(props.modes.length / GRID_COLUMNS)))
const gridHeight = computed(() =>
  gridRows.value * GRID_ROW_HEIGHT + Math.max(gridRows.value - 1, 0) * GRID_GAP + GRID_PADDING * 2,
)

// 轮盘宽度按最长文案估算，图标列始终贴右，宽度随模式数量/文案自适应
const wheelWidth = computed(() => {
  const longest = Math.max(...props.modes.map((mode) => [...mode.label].length))
  return longest * WHEEL_CHAR_WIDTH + WHEEL_GAP + WHEEL_ICON_SIZE +
    WHEEL_PADDING_LEFT + WHEEL_PADDING_RIGHT + WHEEL_BORDER_WIDTH + WHEEL_WIDTH_SLACK
})

const onWheel = (event: WheelEvent) => {
  if (!isExpanded.value) return
  // 只接管画布内的滚轮，页面其它区域的 Alt + 滚轮保持原行为
  if (!(event.target as HTMLElement | null)?.closest('.canvas-container')) return
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  // Alt 下滚轮专用于切模式，必须连同内容滚动与滚动条的 wheel 一起拦掉
  event.preventDefault()
  event.stopPropagation()
  const now = performance.now()
  if (now - lastWheelAt < WHEEL_GESTURE_MS) return
  lastWheelAt = now
  rollDirection.value = event.deltaY > 0 ? 1 : -1
  emit('update:modelValue', wrapIndex(props.modelValue + rollDirection.value))
}

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Alt') return
  // 修饰键的重复 keydown 不能把已收起的弹窗重新打开
  if (event.repeat) return
  isAltDown.value = true
  isDismissed.value = false
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key !== 'Alt') return
  isAltDown.value = false
  isDismissed.value = false
}

const onPointerDown = () => {
  if (isExpanded.value) isDismissed.value = true
}

// Alt + Tab 切走会收不到 keyup，窗口失焦时强制收起
const onWindowBlur = () => {
  isAltDown.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('pointerdown', onPointerDown, true)
  // 捕获阶段：内容与滚动条的 wheel 会 stopPropagation，必须抢在它们前面
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('wheel', onWheel, true)
})
</script>

<style scoped>
/* 悬浮区只在锚点 36×36 内，命中不再穿透到画布，避免误触框选 */
.format-mode-picker {
  position: absolute;
  /* 弹窗中行与锚点对齐，向上要占 58px，贴顶会被画布容器的 overflow:clip 裁掉，所以整体下移 */
  top: 52px;
  right: 12px;
  width: 36px;
  height: 36px;
  pointer-events: auto;
}

.format-mode-anchor {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  /* v-sheet 默认带 surface 底色，会盖住弹窗右边框，所以只保留描边 */
  background: transparent;
  box-shadow: none;
  /* 弹窗收起动画结束后再恢复描边，避免与收缩中的边框重叠变粗 */
  transition: border-color 0s linear 0.18s;
}

.format-mode-picker.is-popup-open .format-mode-anchor {
  border-color: transparent;
  transition: none;
}

/* 锚点图标与轮盘中行图标同位置同尺寸，切换时直接交接，避免缩放造成抖动 */

/* 网格与锚点共用右边缘，右侧留出锚点列，展开后是一整块卡片 */
.format-mode-grid {
  position: absolute;
  top: 50%;
  right: 0;
  display: grid;
  grid-template-columns: repeat(2, 36px);
  grid-auto-rows: 36px;
  justify-content: end;
  align-content: center;
  gap: 2px;
  width: 118px;
  height: var(--mode-grid-height);
  padding: 4px 40px 4px 4px;
  box-sizing: border-box;
  transform: translateY(-50%);
  transform-origin: right center;
  overflow: hidden;
}

/* 尺寸交给网格，悬浮/选中反馈交给 v-btn 的 text 变体 */
.format-mode-grid-item {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 8px;
  transition: opacity 0.12s ease;
}

.mode-tip-desc {
  margin-top: 2px;
  opacity: 0.72;
}

/* 右边缘与锚点齐平，宽度随最长文案自适应，且能从锚点大小平滑展开 */
.format-mode-wheel {
  position: absolute;
  top: 50%;
  right: 0;
  width: var(--mode-wheel-width);
  height: 116px;
  padding: 4px 0;
  box-sizing: border-box;
  transform: translateY(-50%);
  transform-origin: right center;
  overflow: hidden;
}

/* 轨道独立居中，边框伸缩时当前行始终压在锚点上 */
.format-mode-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  height: 108px;
  transform: translateY(-50%);
  transition: opacity 0.12s ease;
}

/* 图标列贴右对齐并与锚点中心重合，文案在左；边框展开时内容位置不动 */
.format-mode-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: none;
  height: 36px;
  padding-left: 12px;
  padding-right: 7px;
  white-space: nowrap;
}

.mode-roll-move,
.mode-roll-enter-active,
.mode-roll-leave-active {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.roll-down .mode-roll-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.roll-down .mode-roll-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.roll-up .mode-roll-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.roll-up .mode-roll-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

/* 离场行脱离文档流，其余两行才能通过 move 过渡平滑上移/下移 */
.mode-roll-leave-active {
  position: absolute;
  left: 0;
  right: 0;
}

/* 绝对定位的静态位置恒在顶部，所以按滚动方向钉死离场行原槽位：向下滚离场的是顶行、向上滚的是底行 */
.roll-down .mode-roll-leave-active {
  top: 0;
}

.roll-up .mode-roll-leave-active {
  bottom: 0;
}

.mode-wheel-enter-active,
.mode-wheel-leave-active {
  transition: width 0.18s ease, height 0.18s ease;
}

/* 边框从锚点大小长到弹窗大小，内容随后淡入，避免整块缩放 */
.mode-wheel-enter-from,
.mode-wheel-leave-to {
  width: 36px;
  height: 36px;
}

/* 展开时内容由边框裁切自然露出，收起时再淡出，避免入场瞬间图标被拖暗 */
.mode-wheel-leave-to .format-mode-track {
  opacity: 0;
}

.mode-grid-enter-active,
.mode-grid-leave-active {
  transition: width 0.18s ease, height 0.18s ease;
}

.mode-grid-enter-from,
.mode-grid-leave-to {
  width: 36px;
  height: 36px;
}

.mode-grid-enter-from .format-mode-grid-item,
.mode-grid-leave-to .format-mode-grid-item {
  opacity: 0;
}
</style>
