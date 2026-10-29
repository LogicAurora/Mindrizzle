<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible" class="format-mode-picker" :class="{ 'is-popup-open': isPopupOpen }"
      :style="{ zIndex: zIndex ?? Z_LAYER.formatModePicker }"
      @pointerenter="openHover" @pointerleave="scheduleHoverClose"
      @pointerdown.stop @mousedown.stop @click.stop>
      <WheelSwitch :options="modes" :model-value="modelValue" :expanded="isExpanded"
        :instant-close="isGridVisible" @update:model-value="emit('update:modelValue', $event)" />
      <ModeGrid :options="modes" :model-value="modelValue" :expanded="isGridVisible"
        :instant-close="isExpanded" @update:model-value="emit('update:modelValue', $event)" />
      <v-sheet class="format-mode-anchor" rounded="md" border>
        <v-icon v-if="!isExpanded" :icon="currentMode.icon" size="20" color="primary" />
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { Z_LAYER } from '../../Core/zIndex.ts'
import ModeGrid from '../../Core/ModeGrid.vue'
import WheelSwitch from '../../Core/WheelSwitch.vue'
import type { FormatMode } from './formatModes.ts'

const props = defineProps<{
  modes: readonly FormatMode[]
  modelValue: number
  visible: boolean
  zIndex?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', index: number): void
  (e: 'update:expanded', value: boolean): void
  (e: 'update:popup-open', value: boolean): void
}>()

const isAltDown = ref(false)
const isCtrlDown = ref(false)
// 开始框选/点选时立即收起，避免弹窗盖住正在选中的文字；松开 Alt 后复位
const isDismissed = ref(false)
const isAnchorHovered = ref(false)
// 指针掠过锚点/弹窗边缘时留一点缓冲，避免浮层闪烁式开关
const HOVER_CLOSE_DELAY = 80
let hoverCloseTimer = 0

const openHover = () => {
  if (hoverCloseTimer) clearTimeout(hoverCloseTimer)
  hoverCloseTimer = 0
  isAnchorHovered.value = true
}

const scheduleHoverClose = () => {
  if (hoverCloseTimer) clearTimeout(hoverCloseTimer)
  hoverCloseTimer = window.setTimeout(() => {
    isAnchorHovered.value = false
    hoverCloseTimer = 0
  }, HOVER_CLOSE_DELAY)
}

// Alt+Ctrl 保留给块下方的格式详情菜单，主轮盘此时不展开
const isExpanded = computed(() => props.visible && isAltDown.value && !isCtrlDown.value && !isDismissed.value)
// 详情菜单需要据此让位，避免两个面板在同一列叠在一起
watch(isExpanded, (value) => emit('update:expanded', value), { immediate: true })
// 悬浮图标面板与 Alt 轮盘互斥，避免同时压在锚点位置
const isGridVisible = computed(() => props.visible && isAnchorHovered.value && !isExpanded.value)
// 任一弹窗展开时由弹窗边框接管锚点描边，避免两条 1px 边框叠成更粗的线
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value)
// 悬浮网格/轮盘打开时把自身提到详情菜单之上
watch(isPopupOpen, (value) => emit('update:popup-open', value), { immediate: true })
const currentMode = computed(() => props.modes[props.modelValue] ?? props.modes[0])

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlDown.value = true
    return
  }
  if (event.key !== 'Alt') return
  // 修饰键的重复 keydown 不能把已收起的弹窗重新打开
  if (event.repeat) return
  // Alt+Ctrl 交给块下方的详情轮盘
  if (event.ctrlKey) return
  isAltDown.value = true
  isDismissed.value = false
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlDown.value = false
    return
  }
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
  isCtrlDown.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('pointerdown', onPointerDown, true)
})

onUnmounted(() => {
  if (hoverCloseTimer) clearTimeout(hoverCloseTimer)
  hoverCloseTimer = 0
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('pointerdown', onPointerDown, true)
})
</script>

<style scoped>
/* 悬浮区只在锚点 36×36 内，命中不再穿透到画布，避免误触框选 */
/* 与添加块选择器统一固定在画布右侧中部 */
.format-mode-picker {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
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
  box-shadow: none;
  /* 弹窗收起动画结束后再恢复描边，避免与收缩中的边框重叠变粗 */
  transition: border-color 0s linear 0.18s;
}

/* 弹窗自带底色与描边，锚点此时透明，避免盖住弹窗右边框 */
.format-mode-picker.is-popup-open .format-mode-anchor {
  background: transparent;
  border-color: transparent;
  transition: none;
}
</style>
