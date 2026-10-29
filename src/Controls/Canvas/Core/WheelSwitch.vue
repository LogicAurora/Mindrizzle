<template>
  <Transition name="mode-wheel" :css="!instantClose">
    <v-sheet v-if="expanded" class="mode-wheel" color="surface" elevation="8" rounded="md" border
      :style="{ '--mode-wheel-width': `${wheelWidth}px` }">
      <TransitionGroup name="mode-roll" tag="div" class="mode-wheel-track"
        :class="rollDirection === 1 ? 'roll-down' : 'roll-up'">
        <div v-for="(option, row) in wheelRows" :key="option.label" class="mode-wheel-row text-body-2"
          :class="row === CURRENT_ROW ? 'text-primary font-weight-medium' : 'text-medium-emphasis'">
          <span>{{ option.label }}</span>
          <v-icon :icon="option.icon" size="20"
            :style="{ visibility: row === CURRENT_ROW && !expanded ? 'hidden' : 'visible' }" />
        </div>
      </TransitionGroup>
    </v-sheet>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { wrapWheelIndex, type WheelOption } from './wheelSwitch.ts'

const props = defineProps<{
  options: readonly WheelOption[]
  modelValue: number
  expanded: boolean
  instantClose?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', index: number): void }>()

// 触摸板一次滑动会连发几十个 wheel，40ms 内视为同一手势，保证一格一格地滚
const WHEEL_GESTURE_MS = 40
const ROW_COUNT = 3
// 三行固定为上一 / 当前 / 下一，中行即当前模式
const CURRENT_ROW = 1
const WHEEL_CHAR_WIDTH = 14
const WHEEL_ICON_SIZE = 20
const WHEEL_GAP = 10
const WHEEL_PADDING_LEFT = 12
// 图标中心要压在锚点中心上：边框 1 + 右侧内边距 7 + 半个图标 10
const WHEEL_PADDING_RIGHT = 7
const WHEEL_BORDER_WIDTH = 2
const WHEEL_WIDTH_SLACK = 4

const rollDirection = ref<1 | -1>(1)
let lastWheelAt = 0

// 弹窗固定三行：上一项 / 当前项 / 下一项，循环取模
const wheelRows = computed(() =>
  Array.from({ length: ROW_COUNT }, (_, row) =>
    props.options[wrapWheelIndex(props.modelValue + row - 1, props.options.length)],
  ),
)

// 宽度按最长文案估算，图标列始终贴右，宽度随选项文案自适应
const wheelWidth = computed(() => {
  const longest = Math.max(...props.options.map((option) => [...option.label].length))
  return longest * WHEEL_CHAR_WIDTH + WHEEL_GAP + WHEEL_ICON_SIZE +
    WHEEL_PADDING_LEFT + WHEEL_PADDING_RIGHT + WHEEL_BORDER_WIDTH + WHEEL_WIDTH_SLACK
})

const onWheel = (event: WheelEvent) => {
  if (!props.expanded) return
  // 只接管画布内的滚轮，页面其它区域的滚轮保持原行为
  if (!(event.target as HTMLElement | null)?.closest('.canvas-container')) return
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  event.preventDefault()
  event.stopPropagation()
  const now = performance.now()
  if (now - lastWheelAt < WHEEL_GESTURE_MS) return
  lastWheelAt = now
  rollDirection.value = event.deltaY > 0 ? 1 : -1
  emit('update:modelValue', wrapWheelIndex(props.modelValue + rollDirection.value, props.options.length))
}

onMounted(() => {
  // 捕获阶段：内容与滚动条的 wheel 会 stopPropagation，必须抢在它们前面
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
})

onUnmounted(() => {
  window.removeEventListener('wheel', onWheel, true)
})
</script>

<style scoped>
/* 右边缘与锚点齐平，宽度随最长文案自适应，且能从锚点大小平滑展开 */
.mode-wheel {
  position: absolute;
  top: 50%;
  right: 0;
  width: var(--mode-wheel-width);
  height: 116px;
  padding: 4px 0;
  box-sizing: border-box;
  transform: translateY(-50%) translateZ(0);
  transform-origin: right center;
  overflow: hidden;
  /* 宽高动画只在弹窗内部生效，避免逐帧触发整页布局与重绘 */
  contain: layout paint;
}

/* 轨道独立居中，边框伸缩时当前行始终压在锚点上 */
.mode-wheel-track {
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
.mode-wheel-row {
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
  /* 仅在动画期间提示浏览器提前准备布局，结束后随 class 一起移除 */
  will-change: width, height;
}

/* 边框从锚点大小长到弹窗大小，内容随后淡入，避免整块缩放 */
.mode-wheel-enter-from,
.mode-wheel-leave-to {
  width: 36px;
  height: 36px;
}

/* 展开时内容由边框裁切自然露出，收起时再淡出，避免入场瞬间图标被拖暗 */
.mode-wheel-leave-to .mode-wheel-track {
  opacity: 0;
}
</style>
