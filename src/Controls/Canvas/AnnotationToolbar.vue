<template>
  <SideToolbar :visible="visible">
    <v-btn
      v-tooltip:left="'选择并编辑批注'"
      :color="tool === 'select' ? 'primary' : undefined"
      :icon="mdiCursorDefault"
      variant="text"
      size="small"
      @click="emit('set-tool', 'select')"
    />
    <v-btn
      v-tooltip:left="'自由绘制'"
      :color="tool === 'pen' ? 'primary' : undefined"
      :icon="mdiFountainPen"
      variant="text"
      size="small"
      @click="emit('set-tool', 'pen')"
    />
    <v-menu location="left" offset="8">
      <template #activator="{ props: connectorProps }">
        <v-btn
          v-bind="connectorProps"
          v-tooltip:left="'连接块'"
          :color="connectorOptionOf(tool) ? 'primary' : undefined"
          :icon="connectorOptionOf(tool)?.icon ?? mdiVectorLine"
          variant="text"
          size="small"
        />
      </template>
      <v-list density="compact" min-width="150">
        <v-list-item
          v-for="option in CONNECTOR_TOOLS"
          :key="option.value"
          :active="tool === option.value"
          @click="emit('set-tool', option.value)"
        >
          <template #prepend>
            <v-icon :icon="option.icon" />
          </template>
          <v-list-item-title>{{ option.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-btn
      v-tooltip:left="'添加文本框'"
      :color="tool === 'text' ? 'primary' : undefined"
      :icon="mdiFormatText"
      variant="text"
      size="small"
      @click="emit('set-tool', 'text')"
    />
    <v-btn
      v-tooltip:left="'擦除批注'"
      :color="tool === 'eraser' ? 'primary' : undefined"
      :icon="mdiEraser"
      variant="text"
      size="small"
      @click="emit('set-tool', 'eraser')"
    />
    <v-menu location="left" offset="8">
      <template #activator="{ props: colorProps }">
        <v-btn
          v-bind="colorProps"
          v-tooltip:left="'批注颜色'"
          class="annotation-color-btn"
          variant="text"
          size="small"
        >
          <span class="annotation-color-dot" :style="{ background: color }" />
        </v-btn>
      </template>
      <v-card class="annotation-menu-card">
        <div class="annotation-colors">
          <button
            v-for="swatch in ANNOTATION_COLORS"
            :key="swatch"
            type="button"
            class="annotation-color"
            :class="{ 'annotation-color--active': color === swatch }"
            :style="{ background: swatch }"
            :title="`颜色 ${swatch}`"
            @click="emit('set-color', swatch)"
          />
        </div>
      </v-card>
    </v-menu>
    <v-menu v-if="selected" location="left" offset="8" :close-on-content-click="false">
      <template #activator="{ props: settingsProps }">
        <v-btn
          v-bind="settingsProps"
          v-tooltip:left="'选中批注设置'"
          :icon="mdiTuneVariant"
          color="primary"
          variant="text"
          size="small"
        />
      </template>
      <v-card class="annotation-menu-card annotation-settings">
        <div class="annotation-panel__head">
          <span>
            {{
              selected.kind === 'connector'
                ? '连接线设置'
                : selected.kind === 'text'
                  ? '文本框设置'
                  : '批注设置'
            }}
          </span>
          <v-btn
            v-tooltip:left="'取消选择'"
            :icon="mdiClose"
            variant="text"
            size="x-small"
            density="comfortable"
            @click="emit('clear-selection')"
          />
        </div>
        <div class="annotation-colors">
          <button
            v-for="swatch in ANNOTATION_COLORS"
            :key="`selected-${swatch}`"
            type="button"
            class="annotation-color"
            :class="{ 'annotation-color--active': selected.color === swatch }"
            :style="{ background: swatch }"
            :title="`颜色 ${swatch}`"
            @click="emit('set-color', swatch)"
          />
        </div>
        <template v-if="selected.kind === 'connector'">
          <div class="annotation-panel__row">
            <span class="annotation-panel__label">起点</span>
            <v-btn
              v-for="option in ANCHOR_OPTIONS"
              :key="`from-${option.value}`"
              v-tooltip:left="`起点${option.title}`"
              :color="(selected.fromAnchor ?? 'auto') === option.value ? 'primary' : undefined"
              :icon="option.icon"
              variant="text"
              size="x-small"
              density="comfortable"
              @click="emit('update-selected', { fromAnchor: option.value })"
            />
          </div>
          <div class="annotation-panel__row">
            <span class="annotation-panel__label">终点</span>
            <v-btn
              v-for="option in ANCHOR_OPTIONS"
              :key="`to-${option.value}`"
              v-tooltip:left="`终点${option.title}`"
              :color="(selected.toAnchor ?? 'auto') === option.value ? 'primary' : undefined"
              :icon="option.icon"
              variant="text"
              size="x-small"
              density="comfortable"
              @click="emit('update-selected', { toAnchor: option.value })"
            />
          </div>
          <template v-if="selected.shape === 'curve'">
            <div class="annotation-panel__row">
              <span class="annotation-panel__label">弯曲</span>
              <v-btn
                v-for="option in BEND_OPTIONS"
                :key="option.value"
                v-tooltip:left="option.title"
                :color="(selected.bend ?? 'auto') === option.value ? 'primary' : undefined"
                :icon="option.icon"
                variant="text"
                size="x-small"
                density="comfortable"
                @click="emit('update-selected', { bend: option.value })"
              />
            </div>
            <div class="annotation-panel__slider">
              <v-slider
                :model-value="selected.curvature ?? DEFAULT_CURVATURE"
                :min="MIN_CURVATURE"
                :max="1"
                :step="0.1"
                hide-details
                density="compact"
                @update:model-value="onCurvatureInput"
              />
            </div>
          </template>
        </template>
        <template v-else-if="selected.kind === 'text'">
          <v-textarea
            label="文本框文本"
            class="annotation-textarea"
            v-model="selected.text"
            rows="3"
            placeholder="输入文本"
            @input="onTextContentInput"
          />
          <div class="annotation-panel__row">
            <span class="annotation-panel__label">字号</span>
            <v-btn
              v-for="size in FONT_SIZE_OPTIONS"
              :key="size"
              :color="
                (selected.fontSize ?? DEFAULT_TEXT_FONT_SIZE) === size ? 'primary' : undefined
              "
              variant="text"
              size="x-small"
              density="comfortable"
              @click="emit('update-selected', { fontSize: size })"
            >
              {{ size }}
            </v-btn>
          </div>
        </template>
      </v-card>
    </v-menu>
    <v-divider class="my-1" />
    <v-btn
      v-tooltip:left="'清空批注'"
      :disabled="count === 0"
      :icon="mdiDeleteSweep"
      color="error"
      variant="text"
      size="small"
      @click="emit('clear')"
    />
    <v-divider class="my-1" />
    <v-btn
      v-tooltip:left="'退出批注'"
      :icon="mdiClose"
      variant="text"
      size="small"
      @click="emit('exit')"
    />
  </SideToolbar>
</template>

<script setup lang="ts">
import {
  mdiArrowDownBold,
  mdiArrowLeftBold,
  mdiArrowLeftRight,
  mdiArrowRightBold,
  mdiArrowTopRight,
  mdiArrowUpBold,
  mdiArrowUpDown,
  mdiAutoFix,
  mdiClose,
  mdiCursorDefault,
  mdiDeleteSweep,
  mdiEraser,
  mdiFormatText,
  mdiFountainPen,
  mdiTuneVariant,
  mdiVectorCurve,
  mdiVectorLine,
} from '@mdi/js';

import SideToolbar from './Core/SideToolbar.vue';
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_CURVATURE,
  DEFAULT_TEXT_FONT_SIZE,
  type AnchorSide,
  type AnnotationItem,
  type AnnotationPatch,
  type AnnotationTool,
  type ConnectorShape,
  type ConnectorStyle,
} from './Core/annotationModel.ts';
import { watch } from 'vue';

type SelectedPatch = AnnotationPatch;

defineProps<{
  visible: boolean;
  tool: AnnotationTool;
  count: number;
  color: string;
  selected: AnnotationItem | null;
}>();

const emit = defineEmits<{
  'set-tool': [tool: AnnotationTool];
  'set-color': [color: string];
  'update-selected': [patch: SelectedPatch];
  'clear-selection': [];
  clear: [];
  exit: [];
}>();

const ANNOTATION_COLORS = [
  DEFAULT_ANNOTATION_COLOR,
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#6b7280',
];

const MIN_CURVATURE = 0.1;
const FONT_SIZE_OPTIONS = [12, 16, 20, 24, 32];

const CONNECTOR_TOOLS: { value: ConnectorShape; title: string; icon: string }[] = [
  { value: 'line', title: '直线连接块', icon: mdiVectorLine },
  { value: 'arrow', title: '箭头连接块', icon: mdiArrowTopRight },
  { value: 'curve', title: '曲线连接块', icon: mdiVectorCurve },
];

const connectorOptionOf = (tool: AnnotationTool) =>
  CONNECTOR_TOOLS.find((option) => option.value === tool) ?? null;

const ANCHOR_OPTIONS: { value: AnchorSide; title: string; icon: string }[] = [
  { value: 'auto', title: '自动', icon: mdiAutoFix },
  { value: 'top', title: '上边', icon: mdiArrowUpBold },
  { value: 'right', title: '右边', icon: mdiArrowRightBold },
  { value: 'bottom', title: '下边', icon: mdiArrowDownBold },
  { value: 'left', title: '左边', icon: mdiArrowLeftBold },
];

const BEND_OPTIONS: { value: NonNullable<ConnectorStyle['bend']>; title: string; icon: string }[] =
  [
    { value: 'auto', title: '自动弯曲', icon: mdiAutoFix },
    { value: 'horizontal', title: '水平出弯', icon: mdiArrowLeftRight },
    { value: 'vertical', title: '垂直出弯', icon: mdiArrowUpDown },
  ];

const onCurvatureInput = (value: number) => emit('update-selected', { curvature: value });

const onTextContentInput = (event: Event) => {
  emit('update-selected', { text: (event.target as HTMLTextAreaElement).value });
};
</script>

<style scoped>
.annotation-colors {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 4px 6px;
}

.annotation-color {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  /* 色板要与浮层背景有边界，浅色块才不会糊成一片 */
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-on-surface) / 0.2);
}

.annotation-color--active {
  border-color: rgb(var(--v-theme-primary));
}

/* 与画布工具条的 small 图标按钮同宽，避免两条工具条一宽一窄 */
.annotation-color-btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}

.annotation-color-dot {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-on-surface) / 0.25);
}

.annotation-menu-card {
  padding: 6px;
}

.annotation-settings {
  width: 240px;
}

.annotation-textarea {
  width: 100%;
  box-sizing: border-box;
  margin: 2px 0 4px;
  padding: 4px 6px;
  border: 1px solid rgb(var(--v-theme-on-surface) / 0.3);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  resize: vertical;
}

.annotation-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  opacity: 0.8;
  white-space: nowrap;
}

.annotation-panel__row {
  display: flex;
  align-items: center;
  gap: 1px;
}

.annotation-panel__label {
  font-size: 0.7rem;
  opacity: 0.7;
  width: 28px;
}

.annotation-panel__slider {
  width: 148px;
  padding: 0 6px;
}
</style>
