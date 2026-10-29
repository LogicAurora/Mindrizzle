<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible && !suppressed" class="format-detail-picker" :class="{ 'is-popup-open': isPopupOpen }"
      :style="{ zIndex: zIndex ?? Z_LAYER.formatDetailPicker }"
      @pointerenter="openHover" @pointerleave="scheduleHoverClose"
      @pointerdown.stop @mousedown.stop @click.stop>
      <WheelSwitch :options="options" :model-value="modelValue" :expanded="isExpanded"
        :instant-close="isGridVisible" @update:model-value="emit('update:modelValue', $event)" />
      <ModeGrid :options="options" :model-value="modelValue" :expanded="isGridVisible"
        :instant-close="isExpanded" @update:model-value="emit('update:modelValue', $event)" />
      <v-sheet class="format-detail-anchor" rounded="md" border>
        <v-icon v-if="!isExpanded" :icon="currentOption.icon" size="20" color="primary" />
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import ModeGrid from '../../Core/ModeGrid.vue'
import WheelSwitch from '../../Core/WheelSwitch.vue'
import type { WheelOption } from '../../Core/wheelSwitch.ts'
import { Z_LAYER } from '../../Core/zIndex.ts'

const props = defineProps<{
  options: readonly WheelOption[]
  modelValue: number
  visible: boolean
  suppressed?: boolean
  zIndex?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', index: number): void
  (e: 'update:popup-open', value: boolean): void
}>()

const isAltDown = ref(false)
const isCtrlDown = ref(false)
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

// Alt+Ctrl 一按下就展开详情轮盘，滚轮只负责切换；主选择器会在 Ctrl 按下时让位
const isExpanded = computed(() => props.visible && isAltDown.value && isCtrlDown.value)
const isGridVisible = computed(() =>
  props.visible && !props.suppressed && isAnchorHovered.value && !isExpanded.value,
)
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value)
watch(isPopupOpen, (value) => emit('update:popup-open', value), { immediate: true })
const currentOption = computed(() => props.options[props.modelValue] ?? props.options[0])

// 组件可能在 Alt 已按住时才挂载，所以用事件自带的修饰键状态补齐另一侧
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Alt') {
    isAltDown.value = true
    if (event.ctrlKey) isCtrlDown.value = true
  }
  if (event.key === 'Control') {
    isCtrlDown.value = true
    if (event.altKey) isAltDown.value = true
  }
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Alt') isAltDown.value = false
  if (event.key === 'Control') isCtrlDown.value = false
}

const onPointerDown = () => {
  isAltDown.value = false
  isCtrlDown.value = false
}

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
/* 挂在主格式选择器正下方、同一列；弹窗层级高于主选择器 */
.format-detail-picker {
  position: absolute;
  /* 主锚点 36px 高、居中于 50%，再留 8px 间距 */
  top: calc(50% + 26px);
  right: 12px;
  width: 36px;
  height: 36px;
  pointer-events: auto;
}

.format-detail-anchor {
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
.format-detail-picker.is-popup-open .format-detail-anchor {
  background: transparent;
  border-color: transparent;
  transition: none;
}
</style>
