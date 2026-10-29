<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible" class="add-block-picker" :class="{ 'is-popup-open': isPopupOpen }"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      @pointerenter="isAnchorHovered = true" @pointerleave="isAnchorHovered = false"
      @pointerdown.stop @mousedown.stop @click.stop>
      <WheelSwitch :options="options" :model-value="modelValue" :expanded="isExpanded"
        @update:model-value="emit('update:modelValue', $event)" />
      <ModeGrid :options="options" :model-value="modelValue" :expanded="isGridVisible"
        :instant-close="isExpanded" @update:model-value="emit('update:modelValue', $event)" />
      <v-sheet class="add-block-anchor" rounded="md" border>
        <v-icon v-if="!isExpanded" :icon="currentOption.icon" size="20" color="primary" />
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { Z_LAYER } from './Core/zIndex.ts'
import ModeGrid from './Core/ModeGrid.vue'
import WheelSwitch from './Core/WheelSwitch.vue'
import { wrapWheelIndex, type WheelOption } from './Core/wheelSwitch.ts'

const props = defineProps<{
  options: readonly WheelOption[]
  modelValue: number
  visible: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', index: number): void }>()

// 停手后弹窗自动收起，避免一直挡住右侧画布
const HIDE_DELAY_MS = 900
const isWheelActive = ref(false)
const isAnchorHovered = ref(false)
let hideTimer = 0

const isExpanded = computed(() => props.visible && isWheelActive.value)
// 悬浮展开全部类型图标，点击切换；滚轮展开时与轮盘互斥
const isGridVisible = computed(() => props.visible && isAnchorHovered.value && !isExpanded.value)
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value)
const currentOption = computed(() => props.options[props.modelValue] ?? props.options[0])

const scheduleHide = () => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    isWheelActive.value = false
    hideTimer = 0
  }, HIDE_DELAY_MS)
}

// 块内滚动容器优先消费滚轮，避免把阅读内容误当成切换添加类型
const isScrollableTarget = (target: EventTarget | null): boolean => {
  let el = target instanceof HTMLElement ? target : null
  while (el && !el.classList.contains('canvas-container')) {
    if (el.classList.contains('custom-scrollbar')) return true
    const style = getComputedStyle(el)
    const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 1
    const canScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 1
    if (canScrollY || canScrollX) return true
    el = el.parentElement
  }
  return false
}

// 展开后的连续滚动交给 WheelSwitch；首次滚动由这里负责展开并切一格
const onWheel = (event: WheelEvent) => {
  if (!props.visible) return
  if (!(event.target as HTMLElement | null)?.closest('.canvas-container')) return
  if (isScrollableTarget(event.target)) return
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  event.preventDefault()
  event.stopPropagation()
  scheduleHide()
  if (isWheelActive.value) return
  isWheelActive.value = true
  const direction = event.deltaY > 0 ? 1 : -1
  emit('update:modelValue', wrapWheelIndex(props.modelValue + direction, props.options.length))
}

const onPointerDown = () => {
  isWheelActive.value = false
}

const onWindowBlur = () => {
  isWheelActive.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = 0
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('wheel', onWheel, true)
})
</script>

<style scoped>
/* 与富文本格式选择器统一固定在画布右侧中部 */
.add-block-picker {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  pointer-events: auto;
}

.add-block-anchor {
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
.add-block-picker.is-popup-open .add-block-anchor {
  background: transparent;
  border-color: transparent;
  transition: none;
}
</style>
