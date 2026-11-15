<template>
  <Teleport to=".canvas-floating-layer" defer>
    <Transition name="selection-toolbar" appear>
      <div
        v-if="visible"
        class="text-selection-toolbar"
        :class="{ 'is-below-selection': isBelowSelection }"
        :style="toolbarStyle"
        @mousedown.stop
        @click.stop
      >
        <v-sheet class="text-selection-menu" rounded="lg" border>
          <div class="toolbar-ribbon-main">
            <div class="toolbar-section paragraph-section">
              <v-select
                :model-value="headingLevel ?? 0"
                :items="headingOptions"
                density="compact"
                variant="outlined"
                hide-details
                single-line
                class="heading-select"
                @mousedown.stop
                @focus="setControlFocus('heading', true)"
                @blur="setControlFocus('heading', false)"
                @update:menu="setHeadingMenuOpen"
                @update:model-value="selectHeading"
              />
              <span class="toolbar-section-label">段落</span>
            </div>
            <v-divider vertical class="toolbar-section-divider" />
            <div class="toolbar-section">
              <v-btn-toggle
                :model-value="activeFormatButtons"
                color="primary"
                density="compact"
                divided
                multiple
                rounded="lg"
                role="group"
                aria-label="文字格式"
                class="toolbar-button-group"
              >
                <v-btn
                  value="bold"
                  :icon="mdiFormatBold"
                  :aria-pressed="isBoldActive"
                  aria-label="加粗"
                  title="加粗"
                  size="small"
                  @mousedown.prevent
                  @click="emit('toggle-bold')"
                />
                <v-btn
                  value="italic"
                  :icon="mdiFormatItalic"
                  :aria-pressed="isItalicActive"
                  aria-label="斜体"
                  title="斜体"
                  size="small"
                  @mousedown.prevent
                  @click="emit('toggle-italic')"
                />
                <v-btn
                  value="underline"
                  :icon="mdiFormatUnderline"
                  :aria-pressed="isUnderlineActive"
                  aria-label="下划线"
                  title="下划线"
                  size="small"
                  @mousedown.prevent
                  @click="emit('toggle-underline')"
                />
              </v-btn-toggle>
              <span class="toolbar-section-label">字体</span>
            </div>
            <v-divider vertical class="toolbar-section-divider" />
            <div class="toolbar-section font-size-section">
              <div class="font-size-control">
                <v-number-input
                  :model-value="fontSizeValue"
                  :min="FONT_SIZE_MIN"
                  :max="FONT_SIZE_MAX"
                  :step="1"
                  suffix="px"
                  aria-label="字号"
                  center-affix
                  density="compact"
                  variant="outlined"
                  control-variant="split"
                  hide-details
                  class="font-size-input"
                  @mousedown.stop
                  @focus="setControlFocus('font-size', true)"
                  @blur="setControlFocus('font-size', false)"
                  @update:model-value="applyFontSize"
                />
                <v-btn
                  :icon="mdiFormatClear"
                  size="small"
                  variant="text"
                  class="default-size-button"
                  aria-label="恢复默认字号"
                  title="恢复默认字号"
                  @mousedown.prevent
                  @click="emit('remove-font-size')"
                />
              </div>
              <span class="toolbar-section-label">字号</span>
            </div>
            <v-divider vertical class="toolbar-section-divider" />
            <div class="toolbar-section color-section">
              <div class="toolbar-color-controls">
                <div class="toolbar-color-control">
                  <div class="toolbar-color-control-input">
                    <v-color-input
                      v-model="customTextColor"
                      aria-label="字体颜色"
                      title="字体颜色"
                      color-pip
                      pip-variant="flat"
                      pip-location="prepend-inner"
                      density="compact"
                      variant="outlined"
                      hide-details
                      mode="hex"
                      :modes="['hex']"
                      class="selection-color-input"
                      @mousedown.stop
                      @focus="setControlFocus('text-color', true)"
                      @blur="setControlFocus('text-color', false)"
                      @update:focused="setControlFocus('text-color', $event)"
                      :menu-props="textColorMenuProps"
                      @update:model-value="emitCustomColor('text', $event)"
                    />
                    <v-btn
                      :icon="mdiEraser"
                      size="small"
                      variant="text"
                      class="clear-color-button"
                      aria-label="清除文字颜色"
                      title="清除文字颜色"
                      @mousedown.prevent
                      @click="emit('apply-text-color', null)"
                    />
                  </div>
                  <span class="toolbar-section-label">字体颜色</span>
                </div>
                <div class="toolbar-color-control">
                  <div class="toolbar-color-control-input">
                    <v-color-input
                      v-model="customHighlightColor"
                      aria-label="背景颜色"
                      title="背景颜色"
                      color-pip
                      pip-variant="flat"
                      pip-location="prepend-inner"
                      density="compact"
                      variant="outlined"
                      hide-details
                      mode="hex"
                      :modes="['hex']"
                      class="selection-color-input"
                      @mousedown.stop
                      @focus="setControlFocus('highlight', true)"
                      @blur="setControlFocus('highlight', false)"
                      @update:focused="setControlFocus('highlight', $event)"
                      :menu-props="highlightMenuProps"
                      @update:model-value="emitCustomColor('highlight', $event)"
                    />
                    <v-btn
                      :icon="mdiEraser"
                      size="small"
                      variant="text"
                      class="clear-color-button"
                      aria-label="清除背景颜色"
                      title="清除背景颜色"
                      @mousedown.prevent
                      @click="emit('apply-highlight', null)"
                    />
                  </div>
                  <span class="toolbar-section-label">背景颜色</span>
                </div>
              </div>
            </div>
          </div>
          <v-divider />
          <div class="toolbar-clipboard-row">
            <span class="toolbar-section-label">剪贴板</span>
            <v-btn
              :prepend-icon="mdiContentCopy"
              size="small"
              variant="text"
              @mousedown.prevent
              @click="emit('copy-text')"
            >
              复制
            </v-btn>
            <v-btn
              :prepend-icon="mdiContentPaste"
              size="small"
              variant="text"
              @mousedown.prevent
              @click="emit('paste-text')"
            >
              粘贴纯文本
            </v-btn>
          </div>
        </v-sheet>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  mdiContentCopy,
  mdiContentPaste,
  mdiEraser,
  mdiFormatBold,
  mdiFormatClear,
  mdiFormatItalic,
  mdiFormatUnderline,
} from '@mdi/js';

import { Z_LAYER } from '../../Core/zIndex.ts';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type FontSizeOption,
} from './extensions/font-size.ts';

const props = defineProps<{
  visible: boolean;
  position: { left: number; top: number };
  isBelowSelection: boolean;
  isBoldActive: boolean;
  isItalicActive: boolean;
  isUnderlineActive: boolean;
  headingLevel: number | null;
  selectedFontSize: FontSizeOption | null;
  textColor: string;
  highlightColor: string;
}>();

const emit = defineEmits<{
  (e: 'menu-open', value: boolean): void;
  (e: 'toggle-bold'): void;
  (e: 'toggle-italic'): void;
  (e: 'toggle-underline'): void;
  (e: 'apply-heading', level: number | null): void;
  (e: 'apply-font-size', size: FontSizeOption): void;
  (e: 'remove-font-size'): void;
  (e: 'apply-text-color', color: string | null): void;
  (e: 'apply-highlight', color: string | null): void;
  (e: 'copy-text'): void;
  (e: 'paste-text'): void;
}>();

const headingOptions = [
  { title: '正文', value: 0 },
  { title: '标题 1', value: 1 },
  { title: '标题 2', value: 2 },
  { title: '标题 3', value: 3 },
  { title: '标题 4', value: 4 },
  { title: '标题 5', value: 5 },
  { title: '标题 6', value: 6 },
];
const customTextColor = ref(props.textColor);
const customHighlightColor = ref(props.highlightColor);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const isHeadingMenuOpen = ref(false);
const focusedControls = new Set<string>();

watch(
  () => props.textColor,
  (color) => (customTextColor.value = color),
);
watch(
  () => props.highlightColor,
  (color) => (customHighlightColor.value = color),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) return;
    isHeadingMenuOpen.value = false;
    focusedControls.clear();
    emitToolbarOpenState();
  },
);

const toolbarStyle = computed(() => ({
  left: `${props.position.left}px`,
  top: `${props.position.top}px`,
  zIndex: Z_LAYER.textSelectionToolbar,
}));

const activeFormatButtons = computed(() => [
  ...(props.isBoldActive ? ['bold'] : []),
  ...(props.isItalicActive ? ['italic'] : []),
  ...(props.isUnderlineActive ? ['underline'] : []),
]);

const emitToolbarOpenState = () => {
  emit('menu-open', isHeadingMenuOpen.value || focusedControls.size > 0);
};

const setHeadingMenuOpen = (isOpen: boolean) => {
  isHeadingMenuOpen.value = isOpen;
  emitToolbarOpenState();
};

const setControlFocus = (control: string, isFocused: boolean) => {
  if (isFocused) focusedControls.add(control);
  else focusedControls.delete(control);
  emitToolbarOpenState();
};

const textColorMenuProps = {
  contentClass: 'text-selection-color-picker',
  'onUpdate:modelValue': (isOpen: boolean) => setControlFocus('text-color-picker', isOpen),
};
const highlightMenuProps = {
  contentClass: 'text-selection-color-picker',
  'onUpdate:modelValue': (isOpen: boolean) => setControlFocus('highlight-picker', isOpen),
};

const fontSizeValue = computed(() =>
  Number.parseInt(props.selectedFontSize ?? `${FONT_SIZE_DEFAULT}px`, 10),
);

const selectHeading = (value: string | number | null) => {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0 || level > 6) return;
  emit('apply-heading', level === 0 ? null : level);
};

const applyFontSize = (value: number | string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const size = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(parsed)));
  emit('apply-font-size', `${size}px`);
};

const emitCustomColor = (kind: 'text' | 'highlight', color: string | null) => {
  if (!color || !HEX_COLOR_PATTERN.test(color)) return;
  if (kind === 'text') emit('apply-text-color', color);
  else emit('apply-highlight', color);
};
</script>

<style scoped>
.text-selection-toolbar {
  position: absolute;
  display: flex;
  width: min(520px, calc(100vw - 16px));
  box-sizing: border-box;
  pointer-events: auto;
  transform: translate(-50%, calc(-100% - 8px));
}

.text-selection-toolbar.is-below-selection {
  transform: translate(-50%, 8px);
}

.text-selection-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 8px 10px 5px;
  box-sizing: border-box;
}

.toolbar-ribbon-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.toolbar-section {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
}

.paragraph-section {
  flex: 0 1 112px;
  width: 112px;
}

.heading-select {
  width: 100%;
}

.toolbar-button-group {
  display: flex;
  height: 36px;
}

.toolbar-button-group :deep(.v-btn) {
  min-width: 32px;
  padding-inline: 5px;
}

.toolbar-section-divider {
  display: none;
}

.font-size-control,
.toolbar-color-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
}

.font-size-input {
  flex: 1 1 100px;
  width: 180px;
  min-width: 0;
}

.font-size-section {
  flex: 1 1 160px;
  max-width: 100%;
}

.font-size-control {
  width: 100%;
}

.font-size-input :deep(input) {
  text-align: center;
}

.default-size-button {
  width: 30px;
  height: 32px;
}

.selection-color-input {
  flex: 1 1 72px;
  width: 120px;
  max-width: 120px;
  height: 36px;
  min-width: 0;
}

.color-section {
  flex: 0 1 312px;
  max-width: 100%;
}

.toolbar-color-controls {
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.toolbar-color-control {
  display: flex;
  flex: 0 1 152px;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.toolbar-color-control-input {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.clear-color-button {
  flex: 0 0 30px;
  width: 30px;
  height: 32px;
}

.toolbar-section-label {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.6875rem;
  line-height: 1;
}

.toolbar-clipboard-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding-top: 3px;
}

.selection-toolbar-enter-active,
.selection-toolbar-leave-active {
  transition:
    opacity 0.14s ease,
    scale 0.14s ease;
  transform-origin: center;
  will-change: opacity, scale;
}

.selection-toolbar-enter-from,
.selection-toolbar-leave-to {
  opacity: 0;
  scale: 0.94;
}
</style>
