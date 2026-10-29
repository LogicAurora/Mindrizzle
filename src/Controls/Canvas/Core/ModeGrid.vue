<template>
  <Transition name="mode-grid" :css="!instantClose">
    <v-sheet v-if="expanded" class="mode-grid" color="surface" elevation="8" rounded="md" border
      :style="{
        '--mode-grid-height': `${gridHeight}px`,
        '--mode-grid-width': `${gridWidth}px`,
        '--mode-grid-columns': gridColumns,
      }">
      <v-tooltip v-for="(option, index) in options" :key="option.label" location="start"
        :open-delay="0" :close-delay="0">
        <template #activator="{ props: activatorProps }">
          <v-btn v-bind="activatorProps" class="mode-grid-item" icon variant="text"
            :color="index === modelValue ? 'primary' : undefined"
            @click="emit('update:modelValue', index)">
            <v-icon :icon="option.icon" size="20" />
          </v-btn>
        </template>
        <div class="text-body-2 font-weight-medium">{{ option.label }}</div>
        <div v-if="option.description" class="text-caption mode-tip-desc">{{ option.description }}</div>
      </v-tooltip>
    </v-sheet>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { WheelOption } from './wheelSwitch.ts'

const props = defineProps<{
  options: readonly WheelOption[]
  modelValue: number
  expanded: boolean
  instantClose?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', index: number): void }>()

const GRID_CELL_SIZE = 36
const GRID_GAP = 2
// 与 .mode-grid 的 padding 保持一致
const GRID_PADDING = 4
// 右侧给锚点留出的总宽度：36 锚点 + 4 间距
const GRID_ANCHOR_COLUMN = 40
const GRID_BORDER_WIDTH = 2
const GRID_MAX_ROWS = 3

// 行数锁死三行内，图标多时加列而不是加行
const gridColumns = computed(() => Math.max(1, Math.ceil(props.options.length / GRID_MAX_ROWS)))
const gridRows = computed(() => Math.ceil(props.options.length / gridColumns.value))
const gridWidth = computed(() =>
  gridColumns.value * GRID_CELL_SIZE + Math.max(gridColumns.value - 1, 0) * GRID_GAP +
  GRID_PADDING + GRID_ANCHOR_COLUMN + GRID_BORDER_WIDTH,
)
const gridHeight = computed(() =>
  gridRows.value * GRID_CELL_SIZE + Math.max(gridRows.value - 1, 0) * GRID_GAP +
  GRID_PADDING * 2 + GRID_BORDER_WIDTH,
)
</script>

<style scoped>
/* 网格与锚点共用右边缘，右侧留出锚点列，展开后是一整块卡片 */
.mode-grid {
  position: absolute;
  top: 50%;
  right: 0;
  display: grid;
  grid-template-columns: repeat(var(--mode-grid-columns), 36px);
  grid-auto-rows: 36px;
  justify-content: end;
  align-content: center;
  gap: 2px;
  width: var(--mode-grid-width);
  height: var(--mode-grid-height);
  padding: 4px 40px 4px 4px;
  box-sizing: border-box;
  transform: translateY(-50%);
  transform-origin: right center;
  overflow: hidden;
}

/* 尺寸交给网格，悬浮/选中反馈交给 v-btn 的 text 变体 */
.mode-grid-item {
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

.mode-grid-enter-active,
.mode-grid-leave-active {
  transition: width 0.18s ease, height 0.18s ease;
}

/* 边框从锚点大小长到卡片大小，图标随后淡入 */
.mode-grid-enter-from,
.mode-grid-leave-to {
  width: 36px;
  height: 36px;
}

.mode-grid-enter-from .mode-grid-item,
.mode-grid-leave-to .mode-grid-item {
  opacity: 0;
}
</style>
