<template>
  <Teleport to=".canvas-container" defer>
    <div v-if="visible" class="format-mode-picker" :style="{ zIndex: Z_LAYER.formatModePicker }">
      <Transition name="mode-wheel">
        <v-sheet v-if="isExpanded" class="format-mode-wheel" color="surface" elevation="8" rounded="md" border>
          <TransitionGroup name="mode-roll" tag="div" class="format-mode-track"
            :class="rollDirection === 1 ? 'roll-down' : 'roll-up'">
            <div v-for="(mode, row) in wheelRows" :key="mode.label" class="format-mode-row text-body-2"
              :class="row === CURRENT_ROW ? 'text-primary font-weight-medium' : 'text-medium-emphasis'">
              <v-icon :icon="mode.icon" size="18" />
              <span>{{ mode.label }}</span>
            </div>
          </TransitionGroup>
        </v-sheet>
      </Transition>
      <v-sheet v-if="!isExpanded" class="format-mode-anchor" :color="isExpanded ? undefined : 'surface'"
        :elevation="isExpanded ? 0 : 2" rounded="md" >
        <v-icon :icon="currentMode.icon" size="20" color="primary" />
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

const isAltDown = ref(false)
// 开始框选/点选时立即收起，避免弹窗盖住正在选中的文字；松开 Alt 后复位
const isDismissed = ref(false)
const rollDirection = ref<1 | -1>(1)
let lastWheelAt = 0

const isExpanded = computed(() => props.visible && isAltDown.value && !isDismissed.value)
const currentMode = computed(() => props.modes[props.modelValue] ?? props.modes[0])

const wrapIndex = (index: number) => ((index % props.modes.length) + props.modes.length) % props.modes.length

// 弹窗固定三行：上一模式 / 当前模式 / 下一模式，循环取模
const wheelRows = computed(() =>
  Array.from({ length: ROW_COUNT }, (_, row) => props.modes[wrapIndex(props.modelValue + row - 1)]),
)

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
/* 纯状态指示，留下命中会挡住画布框选 */
.format-mode-picker {
  position: absolute;
  /* 弹窗中行与锚点对齐，向上要占 58px，贴顶会被画布容器的 overflow:clip 裁掉，所以整体下移 */
  top: 52px;
  right: 12px;
  width: 36px;
  height: 36px;
  pointer-events: none;
}

.format-mode-anchor {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
}

/* 右边缘与锚点齐平、宽度随文案增长，视觉上从锚点向左展开 */
.format-mode-wheel {
  position: absolute;
  top: 50%;
  right: 0;
  width: max-content;
  min-width: 132px;
  height: 116px;
  padding: 4px 0;
  box-sizing: border-box;
  transform: translateY(-50%);
  transform-origin: right center;
  overflow: hidden;
}

.format-mode-track {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 108px;
}

/* 右侧留出锚点宽度，图标与文案在左侧按普通菜单项排布 */
.format-mode-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  height: 36px;
  padding-left: 12px;
  padding-right: 48px;
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
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.mode-wheel-enter-from,
.mode-wheel-leave-to {
  opacity: 0;
  transform: translate(10px, -50%) scaleX(0.72);
}
</style>
