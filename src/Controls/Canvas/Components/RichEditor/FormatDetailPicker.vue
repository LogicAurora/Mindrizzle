<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible && !suppressed" class="format-detail-picker" :class="{ 'is-popup-open': isOverlayVisible }"
      :style="{ zIndex: zIndex ?? Z_LAYER.formatDetailPicker }"
      @pointerenter="openHover" @pointerleave="scheduleHoverClose"
      @pointerdown.stop @mousedown.stop @click.stop>
      <WheelSwitch :options="options" :model-value="modelValue" :expanded="isExpanded"
        :instant-close="isGridVisible" @update:model-value="emit('update:modelValue', $event)" />
      <ModeGrid :options="options" :model-value="modelValue" :expanded="isGridVisible"
        :instant-close="isExpanded" @update:model-value="emit('update:modelValue', $event)"
        @pick-custom="openColorPicker" />
      <v-sheet v-if="isColorPanelOpen" class="format-color-panel" elevation="8" rounded="md" border>
        <v-color-input v-model="draftColor" density="compact" variant="outlined" hide-details
          color-pip pip-variant="flat" mode="hex" :modes="['hex']" @update:model-value="onColorInput" />
      </v-sheet>
      <v-sheet class="format-detail-anchor" rounded="md" border>
        <template v-if="!isExpanded">
          <OptionGlyph :icon="currentOption?.icon" :color="currentOption?.swatch" :custom="currentOption?.custom" />
        </template>
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import ModeGrid from '../../Core/ModeGrid.vue'
import OptionGlyph from '../../Core/OptionGlyph.vue'
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
  (e: 'pick-custom-color', color: string): void
}>()

const isAltDown = ref(false)
const isCtrlDown = ref(false)
const isAnchorHovered = ref(false)
const isColorPanelOpen = ref(false)
const draftColor = ref('')
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
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
  props.visible && !props.suppressed && isAnchorHovered.value && !isExpanded.value && !isColorPanelOpen.value,
)
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value || isColorPanelOpen.value)
// 取色面板打开时锚点不能透明，否则整块选择器像被擦掉
const isOverlayVisible = computed(() => isExpanded.value || isGridVisible.value)
watch(isPopupOpen, (value) => emit('update:popup-open', value), { immediate: true })
const currentOption = computed(() => props.options[props.modelValue] ?? props.options[0])

// 自定义颜色项不直接切换，改为展开取色面板
const openColorPicker = (index: number) => {
  draftColor.value = props.options[index]?.swatch ?? ''
  isColorPanelOpen.value = true
}

// VColorInput 的输入框逐键回写，半成品色值不能带到画布上
const onColorInput = (value: string | null) => {
  if (!value || !HEX_COLOR_PATTERN.test(value)) return
  emit('pick-custom-color', value)
}

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

const onPointerDown = (event: PointerEvent) => {
  isAltDown.value = false
  isCtrlDown.value = false
  // 取色器的菜单挂在 overlay 容器里，点它内部时面板必须继续展开
  const target = event.target instanceof Element ? event.target : null
  if (!target?.closest('.format-color-panel, .format-detail-anchor, .v-overlay-container')) {
    isColorPanelOpen.value = false
  }
}

const onWindowBlur = () => {
  isAltDown.value = false
  isCtrlDown.value = false
  isColorPanelOpen.value = false
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

/* 面板只能向画布内侧展开：右侧仅剩 12px，向外会被 .canvas-container 裁掉 */
.format-color-panel {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: calc(100% + 8px);
  width: 184px;
  padding: 8px;
  box-sizing: border-box;
  transform: translateY(-50%);
}

/* 弹窗自带底色与描边，锚点此时透明，避免盖住弹窗右边框 */
.format-detail-picker.is-popup-open .format-detail-anchor {
  background: transparent;
  border-color: transparent;
  transition: none;
}
</style>
