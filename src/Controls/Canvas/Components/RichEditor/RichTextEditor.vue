<template>
  <MdrCanvasComponentBase
    ref="baseRef"
    v-bind="props.base"
    :icon="mdiNoteText"
    :title="RICH_TEXT_LABEL"
    :height-changable="!autoHeight"
  >
    <div
      v-if="!virtualized"
      ref="wrapperRef"
      class="editor-wrapper inner-component"
      :data-read-only="readOnly ? 'true' : 'false'"
      :class="{ 'auto-height': autoHeight }"
      :style="{
        color: 'var(--v-theme-on-surface)',
        background: 'var(--v-theme-surface)',
      }"
      @mousedown.stop
    >
      <ProseKit :editor="editor">
        <div class="editor-scroll-shell">
          <div ref="scrollRef" class="editor-scroll" @scroll="onEditorScroll">
            <div
              ref="editorMount"
              class="editor-mount"
              :style="isTouchPointerOnEditor ? TOUCH_SELECTING_STYLE : undefined"
            />
          </div>
          <!-- 原生 ::selection 只能方角，所以按行铺圆角块自绘；节点在滚动容器外，不随内容滚动 -->
          <div class="text-selection-highlight" aria-hidden="true">
            <div
              v-for="(rect, index) in textSelectionRects"
              :key="index"
              class="text-selection-highlight-rect"
              :style="{
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
              }"
            />
          </div>
          <Teleport to=".canvas-floating-layer" defer>
            <div
              v-if="isTouchSelectionHandlesVisible"
              class="text-selection-handle-layer"
              :style="{ zIndex: Z_LAYER.textSelectionHandles }"
            >
              <button
                type="button"
                tabindex="-1"
                class="text-selection-handle"
                :style="touchSelectionHandleStyle(touchSelectionHandles.from)"
                aria-label="调整选区起点"
                @pointerdown.stop.prevent="startTouchSelectionHandleDrag('from', $event)"
                @pointermove.stop.prevent="moveTouchSelectionHandleDrag($event)"
                @pointerup.stop.prevent="endTouchSelectionHandleDrag($event)"
                @pointercancel.stop.prevent="endTouchSelectionHandleDrag($event)"
              />
              <button
                type="button"
                tabindex="-1"
                class="text-selection-handle"
                :style="touchSelectionHandleStyle(touchSelectionHandles.to)"
                aria-label="调整选区终点"
                @pointerdown.stop.prevent="startTouchSelectionHandleDrag('to', $event)"
                @pointermove.stop.prevent="moveTouchSelectionHandleDrag($event)"
                @pointerup.stop.prevent="endTouchSelectionHandleDrag($event)"
                @pointercancel.stop.prevent="endTouchSelectionHandleDrag($event)"
              />
            </div>
          </Teleport>
          <TextSelectionToolbar
            :visible="isTextSelectionToolbarVisible && !pendingApply"
            :position="toolbarPosition"
            :is-below-selection="isToolbarBelowSelection"
            :is-bold-active="isBoldActive"
            :is-italic-active="isItalicActive"
            :is-underline-active="isUnderlineActive"
            :heading-level="selectionHeadingLevel"
            :selected-font-size="selectionFontSize"
            :text-color="selectionTextColor"
            :highlight-color="selectionHighlightColor"
            @menu-open="onToolbarMenuOpen"
            @toggle-bold="toggleSelectionBold"
            @toggle-italic="toggleSelectionItalic"
            @toggle-underline="toggleSelectionUnderline"
            @apply-heading="applySelectionHeading"
            @apply-font-size="applySelectionFontSize"
            @remove-font-size="removeSelectionFontSize"
            @apply-text-color="applySelectionTextColor"
            @apply-highlight="applySelectionHighlight"
            @copy-text="copySelectedText"
            @paste-text="pastePlainText"
          />
          <div
            v-if="scrollMetrics.hasVertical"
            class="custom-scrollbar custom-scrollbar-vertical"
            @pointerdown="startVerticalScrollbar"
            @wheel="scrollVertical"
          >
            <div
              class="custom-scrollbar-thumb"
              :style="verticalThumbStyle"
              @pointerdown.stop="startVerticalThumb"
            />
          </div>
          <div
            v-if="scrollMetrics.hasHorizontal"
            class="custom-scrollbar custom-scrollbar-horizontal"
            @pointerdown="startHorizontalScrollbar"
            @wheel="scrollHorizontal"
          >
            <div
              class="custom-scrollbar-thumb"
              :style="horizontalThumbStyle"
              @pointerdown.stop="startHorizontalThumb"
            />
          </div>
        </div>
        <blockHandle :editor="editor" :read-only="readOnly" />
        <SlashMenu v-if="!readOnly" :commands="editor.commands" />
        <!-- .vdr 的 transform 祖先会使 fixed 基准偏移，所以 Teleport 到 body -->
        <Teleport to="body">
          <RowDropIndicator :editor="editor" />
        </Teleport>
      </ProseKit>
      <!-- 格式模式属于富文本块，选择器由块提供、定位到画布右上角 -->
      <FormatModePicker
        v-if="showFormatModes"
        :modes="FORMAT_MODES"
        :model-value="modeIndex"
        :visible="showFormatModes"
        :z-index="formatPickerZ"
        @update:model-value="onSelectMode"
        @update:expanded="isFormatPickerExpanded = $event"
        @update:popup-open="isFormatPopupOpen = $event"
      />
      <FormatDetailPicker
        v-if="showFormatDetail"
        :options="formatDetailOptions"
        :model-value="detailIndex"
        :visible="showFormatDetail"
        :suppressed="isFormatPickerExpanded"
        :z-index="detailPickerZ"
        @update:model-value="onSelectDetail"
        @update:popup-open="isDetailPopupOpen = $event"
        @pick-custom-color="onPickCustomColor"
      />
      <v-snackbar v-model="clipboardNoticeVisible" location="bottom" :timeout="2500">
        {{ clipboardNotice }}
      </v-snackbar>
      <v-overlay v-model="pendingApply" persistent scroll-strategy="none">
        <div
          class="apply-layer"
          @click.left="confirmApply"
          @mousedown.right="cancelApply"
          @contextmenu.prevent="cancelApply"
        >
          <v-card
            :ref="setApplyCardElement"
            class="apply-card"
            :style="{
              left: `${overlayPos.left}px`,
              top: `${overlayPos.top}px`,
              visibility: applyPositionReady ? 'visible' : 'hidden',
            }"
          >
            <v-card-text class="text-center pb-0">
              <div>切换「{{ pendingDisplayLabel }}」？</div>
              <div class="text-caption text-medium-emphasis mt-1">左键应用 : 右键取消</div>
            </v-card-text>
            <v-card-actions class="justify-end ga-1">
              <v-btn size="small" variant="text" @click.stop="cancelApply">取消</v-btn>
              <v-btn size="small" color="primary" @click.stop="confirmApply">应用</v-btn>
            </v-card-actions>
          </v-card>
        </div>
      </v-overlay>
    </div>
    <!-- 视口外的块只留静态快照，省掉 ProseMirror 的插件 state、RO 与逐块 window 捕获监听 -->
    <div v-else class="virtual-snapshot inner-component" v-html="snapshot" />
    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-switch
            :model-value="autoHeight"
            color="primary"
            label="高度自适应内容"
            hint="块高随内容自动调整"
            persistent-hint
            hide-details
            @update:model-value="onAutoHeightToggle"
          />
        </v-list-item>
      </v-list>
    </template>
  </MdrCanvasComponentBase>
</template>
<script lang="ts">
import type { RichTextConfig } from '../../Registry/canvasComponents.ts';

export { RICH_TEXT_CONSTRAINTS as resizeConstraints } from '../../Registry/componentConstraints.ts';

export const RICH_TEXT_LABEL = '富文本';

// 高度由内容驱动时联结不得改它的高度
export const isHeightChangable = (config: RichTextConfig): boolean => config.autoHeight !== true;
</script>
<script setup lang="ts">
import 'prosekit/basic/style.css';
import 'prosekit/basic/typography.css';
import 'prosekit/pm/view/style/prosemirror.css';
import './selectionStyles.css';

import blockHandle from './extensions/block-handle.vue';
import SlashMenu from './extensions/SlashMenu.vue';
import RowDropIndicator from './extensions/RowDropIndicator.vue';
import { ref, shallowRef, onMounted, onUnmounted, computed, reactive, watch, nextTick } from 'vue';
import { ProseKit, useDocChange } from '@prosekit/vue';
import { mdiNoteText } from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { error as logError } from '@tauri-apps/plugin-log';

import { defineExtension } from './extension.ts';
import { createEditor, NodeJSON } from '@prosekit/core';
import { useTextSelectionHighlight } from './extensions/useTextSelectionHighlight.ts';
import { TextSelection } from 'prosekit/pm/state';
import { isFontSizeOption, type FontSizeOption } from './extensions/font-size.ts';
import {
  layoutToCanvasCss,
  layoutToViewportSize,
  layoutToViewportX,
  layoutToViewportY,
  viewportToLayout,
} from './extensions/blockHandleUtils.ts';
import MdrCanvasComponentBase from '../../Core/MdrCanvasComponentBase.vue';
import { Z_LAYER } from '../../Core/zIndex.ts';
import { getErrorMessage } from '../../../../utils/getErrorMessage.ts';
import FormatModePicker from './FormatModePicker.vue';
import FormatDetailPicker from './FormatDetailPicker.vue';
import TextSelectionToolbar from './TextSelectionToolbar.vue';
import {
  FONT_SIZE_DETAILS,
  FORMAT_MODES,
  HEADING_DETAILS,
  colorDetailsOf,
  isHeadingCancelIndex,
} from './formatModes.ts';
import type { FormatModeId } from './formatModes.ts';
import type { MdrCanvasComponentContentProps } from '../../Core/MdrCanvasComponentBase.types.ts';
import type { WidgetConfig } from '../../Registry/canvasComponents.ts';
import type {
  BlockCanvasController,
  BlockComponentController,
} from '../../Core/canvasComponentControllers.ts';

const props = defineProps<
  MdrCanvasComponentContentProps<WidgetConfig> & {
    virtualized?: boolean;
    snapshot?: string;
  }
>();

const readOnly = computed(() => props.base.readOnly === true);
const richTextConfig = computed(() => props.config as RichTextConfig);
const autoHeight = computed(() => richTextConfig.value.autoHeight === true);

// 块组件是 base 的父级、inject 拿不到子级 provide，所以经 ref 取 base 暴露的 controller
const baseRef = ref<{
  controller: BlockComponentController;
  canvasController: BlockCanvasController;
} | null>(null);

// 自动高度改变块高与手柄集合，所以经画布刷新派生状态
const onAutoHeightToggle = (value: unknown) => {
  props.base.handlers.updateConfig({ autoHeight: !!value });
};

const extension = defineExtension();
const editor = createEditor({ extension });
const selectionToolbarState = shallowRef(editor.state);
const editorMount = ref<HTMLDivElement>();
const wrapperRef = ref<HTMLDivElement>();
const scrollRef = ref<HTMLDivElement>();
const isTextSelectionToolbarVisible = ref(false);
const isToolbarBelowSelection = ref(false);
const isToolbarMenuOpen = ref(false);
const isTextSelectionDragging = ref(false);
const isTouchTextSelectionActive = ref(false);
const isTouchSelectionRangePreferred = ref(false);
const isTouchSelectionHandlesVisible = ref(false);
// 手指按下即关原生选区，避免浏览器自己起一套原生选区与自绘手柄打架；直接改目标元素内联样式，避免类选择器重算整棵编辑器子树
const isTouchPointerOnEditor = ref(false);
const TOUCH_SELECTING_STYLE = { userSelect: 'none', webkitUserSelect: 'none' } as const;
type TouchSelectionHandlePoint = { left: number; top: number };
const touchSelectionHandles = ref<{
  from: TouchSelectionHandlePoint;
  to: TouchSelectionHandlePoint;
}>({
  from: { left: 0, top: 0 },
  to: { left: 0, top: 0 },
});
type TouchSelectionDrag = {
  fixedPosition: number;
  clientX: number;
  clientY: number;
};
type TouchSelectionFingerDrag = TouchSelectionDrag & { initialEnd: number };
type TouchSelectionHandleDrag = TouchSelectionDrag & { pointerId: number };
let touchSelectionHandleDrag: TouchSelectionHandleDrag | null = null;
// 长按选词后继续拖动的手势（没有 pointerId，活动端跟随手指）
let touchSelectionFingerDrag: TouchSelectionFingerDrag | null = null;
let touchSelectionAutoScrollFrame = 0;
let fingerDragFrame = 0;
let handleDragFrame = 0;
const isPointerOverTextSelectionToolbar = ref(false);
const toolbarPosition = ref({ left: 0, top: 0 });
const toolbarPointer = { x: Number.NaN, y: Number.NaN };
const clipboardNotice = ref('');
const clipboardNoticeVisible = ref(false);
let toolbarHideTimer = 0;
const { rects: textSelectionRects, refresh: refreshSelectionHighlight } = useTextSelectionHighlight(
  {
    editor,
    scrollRef,
    isToolbarInteractionActive: () =>
      isToolbarMenuOpen.value || isTouchSelectionRangePreferred.value || isColorPickerMounted(),
  },
);
const scrollMetrics = reactive({
  scrollTop: 0,
  scrollLeft: 0,
  scrollHeight: 0,
  scrollWidth: 0,
  clientHeight: 0,
  clientWidth: 0,
  hasVertical: false,
  hasHorizontal: false,
});
let editorMounted = false;
let toolbarLayoutFrame = 0;

const refreshTouchSelectionHandles = () => {
  const scroll = scrollRef.value;
  if (!isTouchSelectionHandlesVisible.value || !editorMounted || !scroll) return;
  const view = editor.view;
  const selection = view.state.selection;
  if (
    !(selection instanceof TextSelection) ||
    (selection.empty && !touchSelectionHandleDrag && !touchSelectionFingerDrag)
  ) {
    isTouchSelectionHandlesVisible.value = false;
    return;
  }
  const canvas = view.dom.closest<HTMLElement>('.canvas');
  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const from = view.coordsAtPos(selection.from);
  const to = view.coordsAtPos(selection.to);
  touchSelectionHandles.value = {
    from: {
      left: layoutToCanvasCss(view, from.left - canvasRect.left),
      top: layoutToCanvasCss(view, from.bottom - canvasRect.top),
    },
    to: {
      left: layoutToCanvasCss(view, to.left - canvasRect.left),
      top: layoutToCanvasCss(view, to.bottom - canvasRect.top),
    },
  };
};

// 非手势入口（滚动、重排）合并到一帧，手势路径仍走上方立即版以当帧跟手
let handlesRefreshFrame = 0;
const scheduleRefreshTouchSelectionHandles = () => {
  if (handlesRefreshFrame) return;
  handlesRefreshFrame = requestAnimationFrame(() => {
    handlesRefreshFrame = 0;
    refreshTouchSelectionHandles();
  });
};

const refreshTextSelection = () => {
  refreshSelectionHighlight();
  refreshTouchSelectionHandles();
};

let selectionRefreshFrame = 0;
const scheduleRefreshTextSelection = () => {
  if (selectionRefreshFrame) return;
  selectionRefreshFrame = requestAnimationFrame(() => {
    selectionRefreshFrame = 0;
    refreshTextSelection();
  });
};

const syncReadOnly = (readOnly: boolean) => {
  if (!editorMounted) return;
  editor.view.setProps({ editable: () => !readOnly });
  wrapperRef.value?.dispatchEvent(
    new CustomEvent('Mindrizzle:rich-text-read-only', { detail: readOnly }),
  );
};

watch(readOnly, (value) => syncReadOnly(value));

const updateScrollMetrics = () => {
  const scroll = scrollRef.value;
  if (!scroll) return;
  Object.assign(scrollMetrics, {
    scrollTop: scroll.scrollTop,
    scrollLeft: scroll.scrollLeft,
    scrollHeight: scroll.scrollHeight,
    scrollWidth: scroll.scrollWidth,
    clientHeight: scroll.clientHeight,
    clientWidth: scroll.clientWidth,
    hasVertical: scroll.scrollHeight > scroll.clientHeight,
    hasHorizontal: scroll.scrollWidth > scroll.clientWidth,
  });
};

const onEditorScroll = () => {
  updateScrollMetrics();
  scheduleRefreshTouchSelectionHandles();
  scheduleRefreshTextSelectionToolbar();
};

// thumb 有 24px 下限、轨道两端各留 2px，所以拖动量与 scroll 的换算必须与渲染公式严格互逆（否则越拖越偏）
const thumbGeometry = (viewport: number, content: number) => {
  const track = Math.max(viewport - 4, 0);
  const thumb = Math.max(24, viewport ** 2 / Math.max(content, 1));
  return {
    thumb,
    travel: Math.max(track - thumb, 0),
    maxScroll: Math.max(content - viewport, 1),
  };
};

const verticalThumbStyle = computed(() => ({
  height: `${thumbGeometry(scrollMetrics.clientHeight, scrollMetrics.scrollHeight).thumb}px`,
  transform: `translateY(${getThumbOffset('vertical')}px)`,
}));

const horizontalThumbStyle = computed(() => ({
  width: `${thumbGeometry(scrollMetrics.clientWidth, scrollMetrics.scrollWidth).thumb}px`,
  transform: `translateX(${getThumbOffset('horizontal')}px)`,
}));

const getThumbOffset = (axis: 'vertical' | 'horizontal') => {
  const viewport = axis === 'vertical' ? scrollMetrics.clientHeight : scrollMetrics.clientWidth;
  const content = axis === 'vertical' ? scrollMetrics.scrollHeight : scrollMetrics.scrollWidth;
  const current = axis === 'vertical' ? scrollMetrics.scrollTop : scrollMetrics.scrollLeft;
  const { travel, maxScroll } = thumbGeometry(viewport, content);
  return (current / maxScroll) * travel;
};

const scrollVertical = (event: WheelEvent) => {
  event.preventDefault();
  event.stopPropagation();
  const scroll = scrollRef.value;
  if (!scroll) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1;
  scroll.scrollTop += event.deltaY * unit;
};

const scrollHorizontal = (event: WheelEvent) => {
  event.preventDefault();
  event.stopPropagation();
  const scroll = scrollRef.value;
  if (!scroll) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientWidth : 1;
  scroll.scrollLeft += (event.deltaX || event.deltaY) * unit;
};

const startVerticalScrollbar = (event: PointerEvent) => {
  if ((event.target as HTMLElement).classList.contains('custom-scrollbar-thumb')) return;
  const scroll = scrollRef.value;
  if (!scroll) return;
  const track = event.currentTarget as HTMLElement;
  // BCR 与 thumb 偏移是布局坐标、event.clientY 是视觉坐标，所以统一换算到视觉空间再比
  const thumbEnd =
    layoutToViewportY(track, track.getBoundingClientRect().top) +
    layoutToViewportSize(track, getThumbOffset('vertical'));
  scroll.scrollTop += (event.clientY < thumbEnd ? -1 : 1) * scroll.clientHeight;
};

const startHorizontalScrollbar = (event: PointerEvent) => {
  if ((event.target as HTMLElement).classList.contains('custom-scrollbar-thumb')) return;
  const scroll = scrollRef.value;
  if (!scroll) return;
  const track = event.currentTarget as HTMLElement;
  const thumbEnd =
    layoutToViewportX(track, track.getBoundingClientRect().left) +
    layoutToViewportSize(track, getThumbOffset('horizontal'));
  scroll.scrollLeft += (event.clientX < thumbEnd ? -1 : 1) * scroll.clientWidth;
};

let scrollbarDrag: {
  axis: 'vertical' | 'horizontal';
  start: number;
  scroll: number;
} | null = null;
const startVerticalThumb = (event: PointerEvent) => startScrollbarDrag('vertical', event);
const startHorizontalThumb = (event: PointerEvent) => startScrollbarDrag('horizontal', event);
// 块内事件需块 uuid，逐层上溯到 wrapper 的 data-uuid
const blockUuid = (): string | null => {
  let el: HTMLElement | null = wrapperRef.value ?? null;
  while (el && !el.classList.contains('drag-wrapper')) el = el.parentElement;
  return el?.getAttribute('data-uuid') ?? null;
};
// 拖拽滚动条时指针会滑出块行、原生 hover 扩展反复清/置 hover 致 popup 与滚动条闪烁，所以通知本块收起 popup
const notifyScrollbarDrag = (active: boolean) => {
  const uuid = blockUuid();
  if (uuid)
    window.dispatchEvent(
      new CustomEvent('Mindrizzle:scrollbar-drag', {
        detail: { active, uuid },
      }),
    );
};

const startScrollbarDrag = (axis: 'vertical' | 'horizontal', event: PointerEvent) => {
  const scroll = scrollRef.value;
  if (!scroll) return;
  // scroll 事件异步、scrollMetrics 可能滞后，所以基准取实时 scrollTop/scrollLeft
  scrollbarDrag = {
    axis,
    start: axis === 'vertical' ? event.clientY : event.clientX,
    scroll: axis === 'vertical' ? scroll.scrollTop : scroll.scrollLeft,
  };
  // hover 自解析会 stopPropagation，所以用捕获阶段
  window.addEventListener('pointermove', moveScrollbarDrag, true);
  window.addEventListener('pointerup', stopScrollbarDrag, { once: true });
  notifyScrollbarDrag(true);
  event.preventDefault();
};
const moveScrollbarDrag = (event: PointerEvent) => {
  const session = scrollbarDrag;
  const scroll = scrollRef.value;
  if (!session || !scroll) return;
  const vertical = session.axis === 'vertical';
  const viewport = vertical ? scroll.clientHeight : scroll.clientWidth;
  const content = vertical ? scroll.scrollHeight : scroll.scrollWidth;
  const { travel, maxScroll } = thumbGeometry(viewport, content);
  // 鼠标位移是视觉像素、而 scrollTop 是布局像素，所以先折回布局空间再按 thumb 可移动距离反解
  const moved = viewportToLayout(
    scroll,
    (vertical ? event.clientY : event.clientX) - session.start,
  );
  const next = session.scroll + (travel > 0 ? (moved * maxScroll) / travel : 0);
  if (vertical) scroll.scrollTop = next;
  else scroll.scrollLeft = next;
};
const stopScrollbarDrag = () => {
  if (scrollbarDrag) notifyScrollbarDrag(false);
  scrollbarDrag = null;
  window.removeEventListener('pointermove', moveScrollbarDrag, true);
};

// posAtCoords/coordsAtPos 混用 BCR 与鼠标坐标、zoom 下必然偏移，所以改用 posAtDOM（只做 DOM↔文档映射）
function resolveDropAtElement(el: HTMLElement | null, preferBefore: boolean): number | null {
  const view = editor.view;
  if (!view || !el || !view.dom.contains(el)) return null;
  let block: HTMLElement = el;
  while (block.parentElement && block.parentElement !== view.dom) block = block.parentElement;
  if (block.parentElement !== view.dom) return preferBefore ? 0 : view.state.doc.content.size;
  const at = view.posAtDOM(block, 0);
  const $pos = view.state.doc.resolve(at);
  // 原子块对应文档级位置，所以需按节点自身取前后
  if ($pos.depth === 0) {
    const node = view.state.doc.nodeAt(at);
    return node && !preferBefore ? at + node.nodeSize : at;
  }
  return preferBefore ? $pos.before($pos.depth) : $pos.after($pos.depth);
}

// 画布拖拽贴边时滚动块内内容
function scrollContent(deltaY: number) {
  if (scrollRef.value) scrollRef.value.scrollTop += deltaY;
}

const TEXT_CARET_EDGE_INSET = 2;
const TOUCH_SELECTION_HANDLE_TARGET_SIZE = 40;
const TOUCH_SELECTION_HANDLE_STEM_LENGTH = 16;
const TOUCH_SELECTION_HANDLE_KNOB_SIZE = 14;
const TOUCH_SELECTION_HANDLE_STEM_WIDTH = 2;
const TOUCH_SELECTION_SCROLL_EDGE = 48;
const TOUCH_SELECTION_SCROLL_MAX_SPEED = 8;

type TouchWordRange = { from: number; to: number };
type TouchWordSegment = { index: number; segment: string; isWordLike?: boolean };
type TouchWordSegmenter = { segment: (text: string) => Iterable<TouchWordSegment> };
type TouchWordSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'word' },
) => TouchWordSegmenter;
const touchWordSegmenterConstructor = (
  Intl as typeof Intl & { Segmenter?: TouchWordSegmenterConstructor }
).Segmenter;
const touchWordSegmenter = touchWordSegmenterConstructor
  ? new touchWordSegmenterConstructor(undefined, { granularity: 'word' })
  : null;

const wordSegmentsOf = (text: string): TouchWordSegment[] => {
  if (touchWordSegmenter) {
    return [...touchWordSegmenter.segment(text)].filter((segment) => segment.isWordLike);
  }
  const fallbackWordPattern =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{M}\p{N}_]+/gu;
  return [...text.matchAll(fallbackWordPattern)].map((match) => ({
    index: match.index ?? 0,
    segment: match[0],
    isWordLike: true,
  }));
};

const wordRangeAtPosition = (position: number): TouchWordRange | null => {
  const resolved = editor.view.state.doc.resolve(position);
  if (!resolved.parent.isTextblock) return null;
  const text = resolved.parent.textBetween(0, resolved.parent.content.size, '', '\uFFFC');
  const words = wordSegmentsOf(text);
  if (!words.length) return null;
  const offset = resolved.parentOffset;
  const selected =
    words.find((word) => offset >= word.index && offset <= word.index + word.segment.length) ??
    words.reduce((nearest, word) => {
      const distance = Math.min(
        Math.abs(offset - word.index),
        Math.abs(offset - (word.index + word.segment.length)),
      );
      const nearestDistance = Math.min(
        Math.abs(offset - nearest.index),
        Math.abs(offset - (nearest.index + nearest.segment.length)),
      );
      return distance < nearestDistance ? word : nearest;
    });
  const start = resolved.start() + selected.index;
  return { from: start, to: start + selected.segment.length };
};

const textPositionAtPoint = (
  clientX: number,
  clientY: number,
  allowHandleHit = false,
): number | null => {
  const scroll = scrollRef.value;
  if (!editorMounted || !scroll) return null;
  const view = editor.view;
  // caret hit-test 使用 viewport 坐标，再经 posAtDOM 映射，避免缩放下 posAtCoords 混用 BCR 坐标
  const rect = scroll.getBoundingClientRect();
  const left = layoutToViewportX(view, rect.left) + TEXT_CARET_EDGE_INSET;
  const right = layoutToViewportX(view, rect.right) - TEXT_CARET_EDGE_INSET;
  const top = layoutToViewportY(view, rect.top) + TEXT_CARET_EDGE_INSET;
  const bottom = layoutToViewportY(view, rect.bottom) - TEXT_CARET_EDGE_INSET;
  // 起手命中（长按/点按）必须落在块内；拖动中手指会滑出块外，仍需依赖下方夹取吸附到边缘
  if (!allowHandleHit && (clientX < left || clientX > right || clientY < top || clientY > bottom)) {
    return null;
  }
  const x = Math.min(Math.max(clientX, left), right);
  const y = Math.min(Math.max(clientY, top), bottom);
  const selectionHandle = allowHandleHit
    ? document.elementFromPoint(x, y)?.closest<HTMLElement>('.text-selection-handle')
    : null;
  const previousPointerEvents = selectionHandle?.style.pointerEvents;
  if (selectionHandle) selectionHandle.style.pointerEvents = 'none';
  try {
    const hit = document.elementFromPoint(x, y);
    if (!hit || !view.dom.contains(hit)) return null;
    // 嵌入组件是原生控件，光标/手柄不可落在它内部，否则选词会跳到相邻文本
    if (hit.closest('[data-node-view-root]')) return null;
    const caret = document.caretPositionFromPoint?.(x, y);
    if (caret && view.dom.contains(caret.offsetNode)) {
      return view.posAtDOM(caret.offsetNode, caret.offset);
    }
    const range = document.caretRangeFromPoint?.(x, y);
    if (range && view.dom.contains(range.startContainer)) {
      return view.posAtDOM(range.startContainer, range.startOffset);
    }
    return null;
  } finally {
    if (selectionHandle && previousPointerEvents != null) {
      selectionHandle.style.pointerEvents = previousPointerEvents;
    }
  }
};

const beginTouchTextSelection = (clientX: number, clientY: number): boolean => {
  cachedScrollRect = null;
  const position = textPositionAtPoint(clientX, clientY);
  const word = position == null ? null : wordRangeAtPosition(position);
  if (!word) {
    placeTouchCaret(clientX, clientY);
    return false;
  }
  isTouchTextSelectionActive.value = true;
  isTouchSelectionRangePreferred.value = true;
  isTouchSelectionHandlesVisible.value = true;
  isTextSelectionDragging.value = true;
  touchSelectionFingerDrag = { fixedPosition: word.from, initialEnd: word.to, clientX, clientY };
  hideTextSelectionToolbar();
  const view = editor.view;
  // 长按选词不抢焦点：移动端聚焦会弹键盘压缩视口，且选区高亮/工具栏都取自文档选区
  window.getSelection()?.removeAllRanges();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, word.from, word.to)),
  );
  refreshTextSelection();
  return true;
};

const placeTouchCaret = (clientX: number, clientY: number) => {
  if (!editorMounted) return;
  isTouchTextSelectionActive.value = false;
  isTouchSelectionRangePreferred.value = false;
  isTouchSelectionHandlesVisible.value = false;
  isTextSelectionDragging.value = false;
  touchSelectionFingerDrag = null;
  hideTextSelectionToolbar();
  const position = textPositionAtPoint(clientX, clientY);
  if (position == null) return;
  const view = editor.view;
  view.focus();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, position, position)),
  );
  refreshTextSelection();
};

const isPointInsideTouchSelection = (position: number | null): boolean => {
  const selection = editor.view.state.selection;
  return (
    isTouchSelectionRangePreferred.value &&
    selection instanceof TextSelection &&
    !selection.empty &&
    position != null &&
    position >= selection.from &&
    position <= selection.to
  );
};

const showTouchSelectionToolbar = (clientX: number, clientY: number) => {
  isTouchTextSelectionActive.value = false;
  isTextSelectionDragging.value = false;
  isTouchSelectionHandlesVisible.value = true;
  touchSelectionFingerDrag = null;
  refreshTextSelection();
  updateTextSelectionToolbar(new MouseEvent('mouseup', { clientX, clientY }), true);
};

// 点在选区内应保留选区（原生行为），点在外侧才折叠到光标
const tapTouchTextSelection = (clientX: number, clientY: number) => {
  if (!editorMounted) return;
  const position = textPositionAtPoint(clientX, clientY);
  if (!isPointInsideTouchSelection(position)) {
    placeTouchCaret(clientX, clientY);
    return;
  }
  showTouchSelectionToolbar(clientX, clientY);
};

// 长按选词后继续拖动 = 移动活动端；锚点保持整词，向一侧拖时另一侧不收缩（与原生一致）
const applyFingerSelectionHead = (drag: TouchSelectionFingerDrag) => {
  if (!editorMounted) return;
  const head = textPositionAtPoint(drag.clientX, drag.clientY, true);
  if (head == null) return;
  const isForward = head >= drag.fixedPosition;
  const from = isForward ? drag.fixedPosition : head;
  const to = isForward ? Math.max(head, drag.initialEnd) : drag.initialEnd;
  const view = editor.view;
  const selection = TextSelection.create(view.state.doc, from, to);
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
  refreshTextSelection();
};

// 手指微抖也会触发整条选文链路，合并到 rAF 并滤掉亚像素位移
const scheduleFingerSelectionHead = () => {
  if (fingerDragFrame) return;
  fingerDragFrame = requestAnimationFrame(() => {
    fingerDragFrame = 0;
    const drag = touchSelectionFingerDrag;
    if (!drag) return;
    applyFingerSelectionHead(drag);
    if (!touchSelectionAutoScrollFrame) {
      touchSelectionAutoScrollFrame = requestAnimationFrame(updateTouchSelectionAutoScroll);
    }
  });
};

const extendTouchTextSelection = (clientX: number, clientY: number) => {
  const drag = touchSelectionFingerDrag;
  if (!drag) return;
  if (Math.abs(clientX - drag.clientX) < 1 && Math.abs(clientY - drag.clientY) < 1) return;
  drag.clientX = clientX;
  drag.clientY = clientY;
  scheduleFingerSelectionHead();
};

const touchSelectionHandleStyle = (point: TouchSelectionHandlePoint): Record<string, string> => {
  const view = editor.view;
  const cssLength = (visualSize: number) =>
    layoutToCanvasCss(view, viewportToLayout(view, visualSize));
  return {
    left: `${point.left}px`,
    top: `${point.top}px`,
    width: `${cssLength(TOUCH_SELECTION_HANDLE_TARGET_SIZE)}px`,
    height: `${cssLength(TOUCH_SELECTION_HANDLE_TARGET_SIZE)}px`,
    '--touch-handle-stem-length': `${cssLength(TOUCH_SELECTION_HANDLE_STEM_LENGTH)}px`,
    '--touch-handle-knob-size': `${cssLength(TOUCH_SELECTION_HANDLE_KNOB_SIZE)}px`,
    '--touch-handle-stem-width': `${cssLength(TOUCH_SELECTION_HANDLE_STEM_WIDTH)}px`,
  };
};

const updateTouchSelectionHead = (fixedPosition: number, clientX: number, clientY: number) => {
  if (!editorMounted) return;
  const head = textPositionAtPoint(clientX, clientY, true);
  if (head == null) return;
  const view = editor.view;
  const selection = TextSelection.create(view.state.doc, fixedPosition, head);
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
  refreshTextSelection();
};

const startTouchSelectionHandleDrag = (edge: 'from' | 'to', event: PointerEvent) => {
  if (event.pointerType !== 'touch' || !editorMounted) return;
  const selection = editor.view.state.selection;
  if (!(selection instanceof TextSelection) || selection.empty) return;
  cachedScrollRect = null;
  touchSelectionFingerDrag = null;
  touchSelectionHandleDrag = {
    pointerId: event.pointerId,
    fixedPosition: edge === 'from' ? selection.to : selection.from,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  isTouchTextSelectionActive.value = true;
  isTextSelectionDragging.value = true;
  hideTextSelectionToolbar();
};

const textSelectionScrollEdge = (pointerY: number, top: number, bottom: number) => {
  if (pointerY < top + TOUCH_SELECTION_SCROLL_EDGE) {
    return { direction: -1 as const, distance: pointerY - top };
  }
  if (pointerY > bottom - TOUCH_SELECTION_SCROLL_EDGE) {
    return { direction: 1 as const, distance: bottom - pointerY };
  }
  return null;
};

// 手势期间滚动容器与画布都不动，矩形只需量一次，避免自动滚动每帧强制布局
let cachedScrollRect: DOMRect | null = null;
const scrollTouchSelectionAtEdge = (pointerY: number): boolean => {
  const scroll = scrollRef.value;
  if (!scroll || !editorMounted) return false;
  cachedScrollRect ??= scroll.getBoundingClientRect();
  const top = layoutToViewportY(editor.view, cachedScrollRect.top);
  const bottom = layoutToViewportY(editor.view, cachedScrollRect.bottom);
  const edge = textSelectionScrollEdge(pointerY, top, bottom);
  if (!edge) return false;
  const canScroll =
    edge.direction < 0
      ? scroll.scrollTop > 0
      : scroll.scrollTop < scroll.scrollHeight - scroll.clientHeight;
  if (!canScroll) return false;
  const speed = Math.max(
    1,
    Math.round(
      TOUCH_SELECTION_SCROLL_MAX_SPEED *
        Math.min(1, Math.max(0, 1 - edge.distance / TOUCH_SELECTION_SCROLL_EDGE)),
    ),
  );
  const previousTop = scroll.scrollTop;
  scroll.scrollTop += edge.direction * viewportToLayout(editor.view, speed);
  return scroll.scrollTop !== previousTop;
};

const activeTouchSelectionDrag = (): TouchSelectionDrag | null =>
  touchSelectionHandleDrag ?? touchSelectionFingerDrag;

const updateTouchSelectionAutoScroll = () => {
  touchSelectionAutoScrollFrame = 0;
  const drag = activeTouchSelectionDrag();
  if (!drag || !scrollTouchSelectionAtEdge(drag.clientY)) return;
  if (drag === touchSelectionFingerDrag && touchSelectionFingerDrag) {
    applyFingerSelectionHead(touchSelectionFingerDrag);
  } else {
    updateTouchSelectionHead(drag.fixedPosition, drag.clientX, drag.clientY);
  }
  touchSelectionAutoScrollFrame = requestAnimationFrame(updateTouchSelectionAutoScroll);
};

const scheduleHandleSelectionHead = () => {
  if (handleDragFrame) return;
  handleDragFrame = requestAnimationFrame(() => {
    handleDragFrame = 0;
    const drag = touchSelectionHandleDrag;
    if (!drag) return;
    updateTouchSelectionHead(drag.fixedPosition, drag.clientX, drag.clientY);
    if (!touchSelectionAutoScrollFrame) {
      touchSelectionAutoScrollFrame = requestAnimationFrame(updateTouchSelectionAutoScroll);
    }
  });
};

const moveTouchSelectionHandleDrag = (event: PointerEvent) => {
  const drag = touchSelectionHandleDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.clientX = event.clientX;
  drag.clientY = event.clientY;
  scheduleHandleSelectionHead();
};

const stopTouchSelectionAutoScroll = () => {
  if (!touchSelectionAutoScrollFrame) return;
  cancelAnimationFrame(touchSelectionAutoScrollFrame);
  touchSelectionAutoScrollFrame = 0;
};

const cancelTouchSelectionDragFrames = () => {
  if (fingerDragFrame) cancelAnimationFrame(fingerDragFrame);
  fingerDragFrame = 0;
  if (handleDragFrame) cancelAnimationFrame(handleDragFrame);
  handleDragFrame = 0;
};

const endTouchTextSelection = (clientX: number, clientY: number, showToolbar = true) => {
  isTouchTextSelectionActive.value = false;
  isTextSelectionDragging.value = false;
  // 拖动已合并到 rAF，收尾必须用最终坐标补一帧，否则最后一次位移会丢
  const pendingDrag = fingerDragFrame ? touchSelectionFingerDrag : null;
  cancelTouchSelectionDragFrames();
  if (pendingDrag) {
    pendingDrag.clientX = clientX;
    pendingDrag.clientY = clientY;
    applyFingerSelectionHead(pendingDrag);
  }
  touchSelectionFingerDrag = null;
  cachedScrollRect = null;
  if (!editorMounted) return;
  refreshTextSelection();
  if (showToolbar) {
    updateTextSelectionToolbar(new MouseEvent('mouseup', { clientX, clientY }), true);
  } else {
    isTouchSelectionRangePreferred.value = false;
    isTouchSelectionHandlesVisible.value = false;
    hideTextSelectionToolbar();
  }
};

const endTouchSelectionHandleDrag = (event: PointerEvent) => {
  if (touchSelectionHandleDrag?.pointerId !== event.pointerId) return;
  cancelTouchSelectionDragFrames();
  updateTouchSelectionHead(touchSelectionHandleDrag.fixedPosition, event.clientX, event.clientY);
  touchSelectionHandleDrag = null;
  stopTouchSelectionAutoScroll();
  endTouchTextSelection(event.clientX, event.clientY);
};

const modeIndex = ref(0);
const detailIndexByMode = reactive<Record<string, number>>({});
const isFormatPickerExpanded = ref(false);
// 哪个选择器的弹窗打开，就把它抬到上层，另一个退回基础层
const isFormatPopupOpen = ref(false);
const isDetailPopupOpen = ref(false);
const formatPickerZ = computed(() =>
  isFormatPopupOpen.value ? Z_LAYER.formatDetailPicker : Z_LAYER.formatModePicker,
);
const detailPickerZ = computed(() =>
  isFormatPopupOpen.value && !isDetailPopupOpen.value
    ? Z_LAYER.formatModePicker
    : Z_LAYER.formatDetailPicker,
);
const showFormatModes = computed(() => props.base.active === true && !readOnly.value);
const currentModeId = computed(() => FORMAT_MODES[modeIndex.value]?.id);
const isSelectionMarkActive = (markName: string): boolean => {
  const { doc, schema, selection } = selectionToolbarState.value;
  const mark = schema.marks[markName];
  return !selection.empty && !!mark && doc.rangeHasMark(selection.from, selection.to, mark);
};
const isBoldActive = computed(() => isSelectionMarkActive('bold'));
const isItalicActive = computed(() => isSelectionMarkActive('italic'));
const isUnderlineActive = computed(() => isSelectionMarkActive('underline'));
const selectionHeadingLevel = computed(() => {
  const parent = selectionToolbarState.value.selection.$from.parent;
  return parent.type.name === 'heading' && typeof parent.attrs.level === 'number'
    ? parent.attrs.level
    : null;
});
const selectionFontSize = computed<FontSizeOption | null>(() => {
  const { doc, schema, selection } = selectionToolbarState.value;
  const markType = schema.marks.fontSize;
  if (selection.empty || !markType) return null;
  let selectedSize: FontSizeOption | null | undefined;
  let isMixed = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) return;
    const mark = node.marks.find((item) => item.type === markType);
    const rawSize = mark?.attrs.size;
    const size = isFontSizeOption(rawSize) ? rawSize : null;
    if (selectedSize === undefined) selectedSize = size;
    else if (selectedSize !== size) isMixed = true;
  });
  return isMixed || selectedSize == null ? null : selectedSize;
});
const selectionColorOf = (markName: string): string | null => {
  const { doc, schema, selection } = selectionToolbarState.value;
  const markType = schema.marks[markName];
  if (selection.empty || !markType) return null;
  let color: string | null | undefined;
  let isMixed = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) return;
    const mark = node.marks.find((item) => item.type === markType);
    const currentColor = typeof mark?.attrs.color === 'string' ? mark.attrs.color : null;
    if (color === undefined) color = currentColor;
    else if (color !== currentColor) isMixed = true;
  });
  return isMixed || color == null ? null : color;
};
const selectionTextColor = computed(() => selectionColorOf('textColor') ?? customColors.textColor);
const selectionHighlightColor = computed(
  () => selectionColorOf('backgroundColor') ?? customColors.highlight,
);
// 自定义颜色按模式各存一份，色板用当前值展示
const customColors = reactive({ textColor: '#111827', highlight: '#fde68a' });
const textColorDetails = computed(() => colorDetailsOf('text', customColors.textColor));
const highlightDetails = computed(() => colorDetailsOf('background', customColors.highlight));

const detailOptionsFor = (modeId: FormatModeId | undefined) => {
  if (modeId === 'heading') return HEADING_DETAILS;
  if (modeId === 'fontSize') return FONT_SIZE_DETAILS;
  if (modeId === 'textColor') return textColorDetails.value;
  if (modeId === 'highlight') return highlightDetails.value;
  return [];
};

const formatDetailOptions = computed(() => detailOptionsFor(currentModeId.value));
const detailIndex = computed(() => detailIndexByMode[currentModeId.value ?? ''] ?? 0);
const showFormatDetail = computed(
  () => showFormatModes.value && formatDetailOptions.value.length > 0,
);

const onSelectDetail = (index: number | null) => {
  if (index == null || !currentModeId.value) return;
  detailIndexByMode[currentModeId.value] = index;
};

const onPickCustomColor = (color: string) => {
  const modeId = currentModeId.value;
  if (modeId !== 'textColor' && modeId !== 'highlight') return;
  customColors[modeId] = color;
  detailIndexByMode[modeId] = detailOptionsFor(modeId).length - 1;
};

// 只有本轮按过 Alt 才允许选区松手时弹确认，避免遗留格式模式反复打扰纯选字
let formatArmed = false;

// 失活后 ProseMirror 仍保存旧选区，重新聚焦会恢复高亮，所以连同 state 选区一起折叠
const clearEditorSelection = () => {
  if (!editorMounted) return;
  const { state, view } = editor;
  if (!state.selection.empty) {
    view.dispatch(
      state.tr.setSelection(TextSelection.near(state.doc.resolve(state.selection.head))),
    );
  }
  if (document.activeElement instanceof HTMLElement && view.dom.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  const selection = window.getSelection();
  if (selection?.anchorNode && view.dom.contains(selection.anchorNode)) selection.removeAllRanges();
};

// 取消选中后不该保留旧格式模式，否则再次选中同一块会直接套用上次的选择
watch(
  () => props.base.active,
  (active) => {
    if (active) return;
    modeIndex.value = 0;
    hideTextSelectionToolbar();
    formatArmed = false;
    isFormatPickerExpanded.value = false;
    isFormatPopupOpen.value = false;
    isDetailPopupOpen.value = false;
    clearEditorSelection();
  },
);

const onAltKeyDown = (event: KeyboardEvent) => {
  // Alt+Ctrl 是详情菜单的层级快捷键，不能顺手把应用确认武装起来
  if (event.key !== 'Alt' || event.ctrlKey) return;
  if (showFormatModes.value) formatArmed = true;
};

// 松开 Alt 立刻解除武装，纯选字不再弹出确认
const onAltKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Alt') formatArmed = false;
};

const onSelectMode = (index: number | null) => {
  if (index == null) return;
  modeIndex.value = index;
};

const applySelectionHeading = (level: number | null) => {
  if (level == null) editor.commands.setParagraph();
  else editor.commands.toggleHeading({ level });
  isPointerOverTextSelectionToolbar.value = true;
  refreshTextSelectionToolbar();
  void refreshToolbarAfterLayout();
};

const applySelectionTextColor = (color: string | null) => {
  isPointerOverTextSelectionToolbar.value = true;
  if (color) editor.commands.addTextColor({ color });
  else editor.commands.removeTextColor();
  if (color) customColors.textColor = color;
  refreshTextSelectionToolbar();
};

const applySelectionHighlight = (color: string | null) => {
  isPointerOverTextSelectionToolbar.value = true;
  if (color) editor.commands.addBackgroundColor({ color });
  else editor.commands.removeBackgroundColor();
  if (color) customColors.highlight = color;
  refreshTextSelectionToolbar();
};

const applyFormatMode = (index: number) => {
  const mode = FORMAT_MODES[index];
  if (!mode) return;
  const commands = editor.commands;
  const detailIdx = detailIndexByMode[mode.id] ?? 0;
  const detail = detailOptionsFor(mode.id)[detailIdx];
  switch (mode.id) {
    case 'heading':
      // 详情最后一项是取消标题，其余索引 + 1 就是标题级别
      if (isHeadingCancelIndex(detailIdx)) commands.setParagraph();
      else commands.toggleHeading({ level: detailIdx + 1 });
      break;
    case 'bold':
      commands.toggleBold();
      break;
    case 'italic':
      commands.toggleItalic();
      break;
    case 'underline':
      commands.toggleUnderline();
      break;
    case 'fontSize': {
      const size = FONT_SIZE_DETAILS[detailIdx]?.size;
      if (size) commands.addFontSize({ size });
      else commands.removeFontSize();
      break;
    }
    case 'textColor':
      if (detail?.swatch) commands.addTextColor({ color: detail.swatch });
      else commands.removeTextColor();
      break;
    case 'highlight':
      if (detail?.swatch) commands.addBackgroundColor({ color: detail.swatch });
      else commands.removeBackgroundColor();
      break;
  }
};

const isSelectionInsideEditor = (): boolean => {
  if (!editorMounted) return false;
  const sel = window.getSelection();
  const dom = editor.view.dom;
  return (
    !!sel &&
    !sel.isCollapsed &&
    !!sel.anchorNode &&
    !!sel.focusNode &&
    dom.contains(sel.anchorNode) &&
    dom.contains(sel.focusNode)
  );
};

const TEXT_SELECTION_TOOLBAR_HEIGHT = 108;
const TEXT_SELECTION_TOOLBAR_GAP = 8;
const TEXT_SELECTION_TOOLBAR_WIDTH = 520;
const TEXT_SELECTION_TOOLBAR_VIEWPORT_MARGIN = 8;
const TOOLBAR_HIDE_DELAY_MS = 180;

const selectionRangeInsideEditor = (): Range | null => {
  const view = editorMounted ? editor.view : null;
  if (!view) return null;
  if (isTouchSelectionRangePreferred.value) {
    const selection = view.state.selection;
    if (!(selection instanceof TextSelection) || selection.empty) {
      isTouchSelectionRangePreferred.value = false;
      return null;
    }
    const start = view.domAtPos(selection.from);
    const end = view.domAtPos(selection.to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (!view.dom.contains(range.commonAncestorContainer)) return null;
    const ancestor =
      range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    return ancestor?.closest('[data-node-view-root]') ? null : range;
  }
  const selection = window.getSelection();
  const isToolbarInteraction = isToolbarEngaged();
  let range: Range | null = null;
  if (isToolbarInteraction) {
    const { selection: editorSelection } = view.state;
    if (!(editorSelection instanceof TextSelection) || editorSelection.empty) return null;
    const start = view.domAtPos(editorSelection.from);
    const end = view.domAtPos(editorSelection.to);
    range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } else if (isSelectionInsideEditor() && selection?.rangeCount) {
    range = selection.getRangeAt(0);
  }
  if (!range || !view.dom.contains(range.commonAncestorContainer)) return null;
  const ancestor =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  return ancestor?.closest('[data-node-view-root]') ? null : range;
};

const cancelToolbarHide = () => {
  if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
  toolbarHideTimer = 0;
};

// 菜单/取色弹层展开、或指针停在工具栏/蒙层上时，工具栏一律不能收起，否则弹层会跟着卸载
const isToolbarEngaged = () =>
  isToolbarMenuOpen.value || isPointerOverTextSelectionToolbar.value || isColorPickerMounted();

const hideTextSelectionToolbar = () => {
  cancelToolbarHide();
  // 拖动中每条指针事件都会走到这里，已收起时不再写 reactive 触发渲染
  if (
    !isTextSelectionToolbarVisible.value &&
    !isToolbarMenuOpen.value &&
    !isPointerOverTextSelectionToolbar.value
  )
    return;
  isTextSelectionToolbarVisible.value = false;
  isToolbarMenuOpen.value = false;
  isPointerOverTextSelectionToolbar.value = false;
};

const scheduleToolbarHide = () => {
  cancelToolbarHide();
  toolbarHideTimer = window.setTimeout(() => {
    toolbarHideTimer = 0;
    if (isToolbarMenuOpen.value || isPointerOverTextSelectionToolbar.value) return;
    isTextSelectionToolbarVisible.value = false;
  }, TOOLBAR_HIDE_DELAY_MS);
};

const updateTextSelectionToolbar = (event?: MouseEvent | PointerEvent, forceShow = false) => {
  if (pendingApply.value) {
    hideTextSelectionToolbar();
    return;
  }
  if (editorMounted) selectionToolbarState.value = editor.state;
  if (event) {
    toolbarPointer.x = event.clientX;
    toolbarPointer.y = event.clientY;
    isPointerOverTextSelectionToolbar.value =
      event.target instanceof Element &&
      event.target.closest('.text-selection-toolbar, .text-selection-color-picker') !== null;
  }
  // 菜单/取色器等弹层展开时整条工具栏不能消失，否则弹层会跟着被卸载
  if (
    !isToolbarEngaged() &&
    (isTextSelectionDragging.value || isTouchTextSelectionActive.value || readOnly.value)
  ) {
    hideTextSelectionToolbar();
    return;
  }
  const range = selectionRangeInsideEditor();
  const canvas = editorMounted ? (editor.view.dom.closest('.canvas') as HTMLElement | null) : null;
  if (!canvas || !Number.isFinite(toolbarPointer.x) || !Number.isFinite(toolbarPointer.y)) {
    hideTextSelectionToolbar();
    return;
  }
  if (!range) {
    if (isToolbarEngaged()) return;
    hideTextSelectionToolbar();
    return;
  }
  selectionToolbarState.value = editor.state;
  const view = editor.view;
  const selectionRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const canvasContainer = view.dom.closest('.canvas-container') as HTMLElement | null;
  if (!selectionRects.length || !canvasContainer) {
    if (isToolbarEngaged()) return;
    hideTextSelectionToolbar();
    return;
  }
  const firstRect = selectionRects[0];
  const lastRect = selectionRects[selectionRects.length - 1];
  const canvasRect = canvas.getBoundingClientRect();
  const viewportRect = canvasContainer.getBoundingClientRect();
  const toolbar = canvasContainer.querySelector('.text-selection-toolbar');
  const toolbarRect = toolbar?.getBoundingClientRect();
  const toolbarHeight = layoutToViewportSize(
    view,
    toolbarRect?.height || TEXT_SELECTION_TOOLBAR_HEIGHT,
  );
  const toolbarWidth = layoutToViewportSize(
    view,
    toolbarRect?.width || TEXT_SELECTION_TOOLBAR_WIDTH,
  );
  const firstTop = layoutToViewportY(view, firstRect.top);
  const lastBottom = layoutToViewportY(view, lastRect.bottom);
  const availableAbove = firstTop - viewportRect.top;
  const availableBelow = viewportRect.bottom - lastBottom;
  // 手机端工具栏较高，一侧放不下时优先选放得下的一侧，避免顶部/底部溢出视口
  const fitsAbove = availableAbove >= toolbarHeight + TEXT_SELECTION_TOOLBAR_GAP;
  const fitsBelow = availableBelow >= toolbarHeight + TEXT_SELECTION_TOOLBAR_GAP;
  const belowSelection = fitsAbove ? false : fitsBelow ? true : availableBelow > availableAbove;
  const anchorRect = belowSelection ? lastRect : firstRect;
  const localTop = (belowSelection ? anchorRect.bottom : anchorRect.top) - canvasRect.top;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterVisual = layoutToViewportX(view, anchorCenterX);
  const maxHalfWidth = Math.max(
    (viewportRect.width - TEXT_SELECTION_TOOLBAR_VIEWPORT_MARGIN * 2) / 2,
    0,
  );
  const halfToolbarWidth = Math.min(toolbarWidth / 2, maxHalfWidth);
  const minCenterX = viewportRect.left + halfToolbarWidth + TEXT_SELECTION_TOOLBAR_VIEWPORT_MARGIN;
  const maxCenterX = viewportRect.right - halfToolbarWidth - TEXT_SELECTION_TOOLBAR_VIEWPORT_MARGIN;
  const toolbarCenterX = Math.min(Math.max(anchorCenterVisual, minCenterX), maxCenterX);
  const adjustedAnchorX =
    anchorCenterX + viewportToLayout(view, toolbarCenterX - anchorCenterVisual);
  toolbarPosition.value = {
    left: layoutToCanvasCss(view, adjustedAnchorX - canvasRect.left),
    top: layoutToCanvasCss(view, localTop),
  };
  isToolbarBelowSelection.value = belowSelection;
  if (isToolbarEngaged()) {
    cancelToolbarHide();
    return;
  }
  const target = event?.target;
  const isPointerTargetInSelection =
    target instanceof Node && view.dom.contains(target) && range.intersectsNode(target);
  const isPointerOverSelection =
    isPointerTargetInSelection ||
    selectionRects.some((rect) => {
      const left = layoutToViewportX(view, rect.left);
      const top = layoutToViewportY(view, rect.top);
      const right = left + layoutToViewportSize(view, rect.width);
      const bottom = top + layoutToViewportSize(view, rect.height);
      return (
        toolbarPointer.x >= left &&
        toolbarPointer.x <= right &&
        toolbarPointer.y >= top &&
        toolbarPointer.y <= bottom
      );
    });
  if (!isPointerOverSelection && !forceShow) {
    // 松手点常在选区外一像素，且选区/内容刷新时指针也可能落在矩形外，只有悬停移开才收起
    if (event && event.type !== 'mouseup') scheduleToolbarHide();
    return;
  }
  cancelToolbarHide();
  isTextSelectionToolbarVisible.value = true;
};

// 工具栏、选区手柄以及取色弹层（Vuetify 会把菜单 Teleport 到 .v-overlay-container）都属于工具栏交互，点它们不算点外部
const isTextSelectionOverlayTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  !!target.closest('.text-selection-toolbar, .text-selection-color-picker, .text-selection-handle');

// 取色弹层挂载期间工具栏必须常驻：它随工具栏一起卸载，且触摸端没有 hover 用来重算交互态
const isColorPickerMounted = () => document.querySelector('.text-selection-color-picker') !== null;

const onTextSelectionMouseDown = (event: MouseEvent) => {
  if (event.button !== 0 || !editorMounted) return;
  // 触摸按下产生的兼容 mousedown 不能当作鼠标点击，否则会立刻抹掉刚建立的自绘选区
  if (isTouchPointerOnEditor.value) return;
  if (isTextSelectionOverlayTarget(event.target)) {
    isPointerOverTextSelectionToolbar.value = true;
    return;
  }
  isTouchSelectionRangePreferred.value = false;
  isTouchSelectionHandlesVisible.value = false;
  isTextSelectionDragging.value = editor.view.dom.contains(event.target as Node);
  if (isTextSelectionDragging.value) hideTextSelectionToolbar();
};

const onTextSelectionPointerMove = (event: PointerEvent) => {
  if (!event.isTrusted) return;
  // 触摸有独立手势链路，这里只处理鼠标悬停，避免手指抬起后反复计算并抖动收起工具栏
  if (event.pointerType === 'touch') return;
  if (event.buttons !== 0 && isTextSelectionToolbarVisible.value) return;
  updateTextSelectionToolbar(event);
};

const onTouchTextSelectionContextMenu = (event: MouseEvent) => {
  // 触摸长按选字后浏览器仍可能补发 contextmenu，原生菜单与选区工具栏重复，这里一并吞掉
  if (isTouchTextSelectionActive.value || isTouchSelectionRangePreferred.value) {
    event.preventDefault();
  }
};

const onTouchSelectionPointerDown = (event: PointerEvent) => {
  if (event.pointerType !== 'touch') return;
  const insideEditor =
    event.target instanceof Node && editorMounted && editor.view.dom.contains(event.target);
  isTouchPointerOnEditor.value = insideEditor;
  // 触摸没有 hover，工具栏交互态只能靠 pointerdown 维护；否则点开取色器后选区折叠触发的刷新会把整条工具栏收掉
  const isOverlayTarget = isTextSelectionOverlayTarget(event.target) || isColorPickerMounted();
  isPointerOverTextSelectionToolbar.value = isOverlayTarget;
  if (isOverlayTarget) return;
  // 点编辑器内由 tapTouchTextSelection 判断保留还是折叠选区；只有点外部才在这里清理
  if (insideEditor || !isTouchSelectionHandlesVisible.value) return;
  isTouchSelectionHandlesVisible.value = false;
  isTouchSelectionRangePreferred.value = false;
  touchSelectionFingerDrag = null;
  hideTextSelectionToolbar();
};

const onPointerEnd = () => {
  isTouchPointerOnEditor.value = false;
  // 编辑器内 DOM 可能在 mouseup 冒泡到 window 前被选区更新替换掉，拖拽标记若永久为 true 工具栏就再也弹不出来
  isTextSelectionDragging.value = false;
};

const refreshTextSelectionToolbar = () => {
  // 取色器/菜单展开时，焦点移进控件会让 DOM 选区折叠，此时不能拿"在拖动/触摸中"去收工具栏
  if (
    !isToolbarEngaged() &&
    (isTextSelectionDragging.value || isTouchTextSelectionActive.value || readOnly.value)
  ) {
    hideTextSelectionToolbar();
    return;
  }
  refreshTouchSelectionHandles();
  if (editorMounted) selectionToolbarState.value = editor.state;
  updateTextSelectionToolbar();
};

// selectionchange / scroll / resize 常同帧连发，合并到一帧只做一次选区与工具栏布局查询
let toolbarRefreshFrame = 0;
const scheduleRefreshTextSelectionToolbar = () => {
  if (toolbarRefreshFrame) return;
  toolbarRefreshFrame = requestAnimationFrame(() => {
    toolbarRefreshFrame = 0;
    refreshTextSelectionToolbar();
  });
};

const refreshToolbarAfterLayout = async () => {
  await nextTick();
  if (!editorMounted) return;
  if (toolbarLayoutFrame) cancelAnimationFrame(toolbarLayoutFrame);
  toolbarLayoutFrame = requestAnimationFrame(() => {
    toolbarLayoutFrame = 0;
    refreshTextSelection();
    refreshTextSelectionToolbar();
  });
};

const onToolbarMenuOpen = (isOpen: boolean) => {
  isToolbarMenuOpen.value = isOpen;
  if (isOpen) cancelToolbarHide();
};

const toggleSelectionBold = () => {
  editor.commands.toggleBold();
  refreshTextSelectionToolbar();
};

const toggleSelectionItalic = () => {
  editor.commands.toggleItalic();
  refreshTextSelectionToolbar();
};

const toggleSelectionUnderline = () => {
  editor.commands.toggleUnderline();
  refreshTextSelectionToolbar();
};

const applySelectionFontSize = (size: FontSizeOption) => {
  if (editor.state.selection.empty) return;
  editor.commands.addFontSize({ size });
  isPointerOverTextSelectionToolbar.value = true;
  refreshTextSelection();
  refreshTextSelectionToolbar();
};

const removeSelectionFontSize = () => {
  editor.commands.removeFontSize();
  refreshTextSelectionToolbar();
};

const showClipboardNotice = (message: string) => {
  clipboardNotice.value = message;
  clipboardNoticeVisible.value = true;
};

const reportClipboardFailure = async (operation: string, cause: unknown) => {
  const message = getErrorMessage(cause);
  showClipboardNotice(`${operation}失败：${message}`);
  if (isTauri()) await logError(`富文本${operation}失败：${message}`);
};

const copySelectedText = async () => {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return;
  const text = state.doc.textBetween(from, to, '\n');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入');
    await navigator.clipboard.writeText(text);
    showClipboardNotice('已复制选中文字');
  } catch (cause) {
    await reportClipboardFailure('复制', cause);
  }
};

const pastePlainText = async () => {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return;
  try {
    if (!navigator.clipboard?.readText) throw new Error('当前环境不支持读取剪贴板');
    const text = await navigator.clipboard.readText();
    const currentSelection = editor.state.selection;
    if (
      editor.state.doc !== state.doc ||
      currentSelection.from !== from ||
      currentSelection.to !== to
    ) {
      showClipboardNotice('选区已变化，请重新选择后粘贴');
      return;
    }
    if (!text) {
      showClipboardNotice('剪贴板中没有纯文本');
      return;
    }
    editor.view.dispatch(editor.state.tr.insertText(text, from, to));
    showClipboardNotice('已粘贴纯文本');
  } catch (cause) {
    await reportClipboardFailure('粘贴', cause);
  }
};

const onRichTextContextFormat = (event: Event) => {
  if (readOnly.value || !selectionRangeInsideEditor()) return;
  event.preventDefault();
  applyFormatMode(modeIndex.value);
  formatArmed = false;
  window.getSelection()?.removeAllRanges();
};

const APPLY_OVERLAY_MARGIN = 8;
const APPLY_LOCK_MS = 300;
let applyLockUntil = 0;

interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const pendingApply = ref(false);
const pendingFormat = ref(0);
const pendingLabel = computed(() => FORMAT_MODES[pendingFormat.value]?.label ?? '格式');
// 标题/颜色等带详情选项的模式，把具体选项一并带进确认文案
const pendingDisplayLabel = computed(() => {
  const modeId = FORMAT_MODES[pendingFormat.value]?.id;
  const detail = detailOptionsFor(modeId)[detailIndexByMode[modeId ?? ''] ?? 0]?.label;
  return detail ? `${pendingLabel.value} : ${detail}` : pendingLabel.value;
});
const overlayPos = ref({ left: 0, top: 0 });
const applyPositionReady = ref(false);
const applyCardElement = ref<HTMLElement | null>(null);

const setApplyCardElement = (element: unknown) => {
  applyCardElement.value =
    (element as { $el?: HTMLElement } | null)?.$el ?? (element as HTMLElement | null);
};

const applyAnchorRectOf = (rect: DOMRect, element: HTMLElement): ViewportRect => {
  const width = layoutToViewportSize(element, rect.width);
  const height = layoutToViewportSize(element, rect.height);
  const left = layoutToViewportX(element, rect.left);
  const top = layoutToViewportY(element, rect.top);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
};

const positionApplyCard = (anchor: ViewportRect, card: HTMLElement) => {
  const rect = card.getBoundingClientRect();
  const maxLeft = Math.max(
    APPLY_OVERLAY_MARGIN,
    window.innerWidth - rect.width - APPLY_OVERLAY_MARGIN,
  );
  const maxTop = Math.max(
    APPLY_OVERLAY_MARGIN,
    window.innerHeight - rect.height - APPLY_OVERLAY_MARGIN,
  );
  const left = Math.min(
    Math.max(anchor.left + (anchor.width - rect.width) / 2, APPLY_OVERLAY_MARGIN),
    maxLeft,
  );
  const above = anchor.top - rect.height - APPLY_OVERLAY_MARGIN;
  const below = anchor.bottom + APPLY_OVERLAY_MARGIN;
  const availableAbove = anchor.top - APPLY_OVERLAY_MARGIN * 2;
  const availableBelow = window.innerHeight - anchor.bottom - APPLY_OVERLAY_MARGIN * 2;
  const preferredTop =
    above >= APPLY_OVERLAY_MARGIN
      ? above
      : below <= maxTop
        ? below
        : availableAbove >= availableBelow
          ? above
          : below;
  overlayPos.value = {
    left,
    top: Math.min(Math.max(preferredTop, APPLY_OVERLAY_MARGIN), maxTop),
  };
};

const keepApplyCardInViewport = () => {
  const card = applyCardElement.value;
  if (!pendingApply.value || !applyPositionReady.value || !card) return;
  const rect = card.getBoundingClientRect();
  const maxLeft = Math.max(
    APPLY_OVERLAY_MARGIN,
    window.innerWidth - rect.width - APPLY_OVERLAY_MARGIN,
  );
  const maxTop = Math.max(
    APPLY_OVERLAY_MARGIN,
    window.innerHeight - rect.height - APPLY_OVERLAY_MARGIN,
  );
  overlayPos.value = {
    left: Math.min(Math.max(overlayPos.value.left, APPLY_OVERLAY_MARGIN), maxLeft),
    top: Math.min(Math.max(overlayPos.value.top, APPLY_OVERLAY_MARGIN), maxTop),
  };
};

const openApplyOverlay = async (rect: DOMRect) => {
  const wrapper = wrapperRef.value;
  if (!wrapper) return;
  const anchor = applyAnchorRectOf(rect, wrapper);
  hideTextSelectionToolbar();
  applyPositionReady.value = false;
  pendingApply.value = true;
  await nextTick();
  const card = applyCardElement.value;
  if (!pendingApply.value || !card) return;
  positionApplyCard(anchor, card);
  applyPositionReady.value = true;
};

const onSelectionMouseUp = (event: MouseEvent) => {
  isTextSelectionDragging.value = false;
  updateTextSelectionToolbar(event);
  if (!showFormatModes.value || pendingApply.value) return;
  // 任何模式（含标题）都必须按住 Alt 完成选区才询问
  if (!event.altKey || !formatArmed) return;
  if (Date.now() < applyLockUntil || !isSelectionInsideEditor()) return;
  const selection = window.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  if (!rect?.width || !rect.height) return;
  applyLockUntil = Date.now() + APPLY_LOCK_MS;
  pendingFormat.value = modeIndex.value;
  void openApplyOverlay(rect);
};

const confirmApply = () => {
  pendingApply.value = false;
  applyPositionReady.value = false;
  formatArmed = false;
  applyFormatMode(pendingFormat.value);
  // 选区保留会经 mouseup 再次询问，所以应用后同样清除选区并失焦
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.getSelection()?.removeAllRanges();
};

const cancelApply = () => {
  pendingApply.value = false;
  applyPositionReady.value = false;
  formatArmed = false;
  // ProseMirror 失焦前会恢复内部选区，所以须先 blur 再清选区，否则右键 mouseup 会重开询问
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.getSelection()?.removeAllRanges();
};

// 再加上 .content-area 上下 padding(8) 与 border(2)，共 10
const AUTO_HEIGHT_EXTRA = 10;
// auto-height 类解除了 height:100% 钳制，所以 offsetHeight 即内容自然高度
const syncAutoHeight = () => {
  if (!autoHeight.value) return;
  const scrollEl = wrapperRef.value?.querySelector('.editor-scroll') as HTMLElement | null;
  if (!scrollEl) return;
  const height = Math.ceil(scrollEl.offsetHeight + AUTO_HEIGHT_EXTRA);
  baseRef.value?.controller.resizeTo({ height });
  followCursor(cursorVisualY(height));
};

// 光标行在块内的 y（视觉像素），供输入时跟随滚动
const cursorVisualY = (height: number): number => {
  const head = editor.view?.state.selection.head;
  const wrapperRect = wrapperRef.value?.getBoundingClientRect();
  if (head == null || !wrapperRect) return height;
  const coords = editor.view!.coordsAtPos(head);
  const cursorY = coords ? Math.min(Math.max(coords.bottom - wrapperRect.top, 0), height) : height;
  return wrapperRef.value ? layoutToViewportSize(wrapperRef.value, cursorY) : cursorY;
};

const CURSOR_VISIBLE_MARGIN = 24;
// 光标贴近视口底部时上移画布，否则输入行会被裁
const followCursor = (cursorY: number) => {
  const canvas = baseRef.value?.canvasController;
  const view = canvas?.getViewData();
  if (!view?.viewport || view.isPanning) return;
  // 屏幕 y = 容器顶 + content*zoom + origin + pan，与画布侧几何同公式
  const cursorBottom =
    view.viewport.top + view.block.y * view.zoom + view.origin.y + view.pan.y + cursorY;
  const over = cursorBottom - (view.viewport.bottom - CURSOR_VISIBLE_MARGIN);
  if (over > 0) canvas?.panBy(0, -Math.round(over));
};

// 组件 width/height 走 attr、改 attr 未必改变容器盒子，所以 doc change 后补测（rAF 合并同帧事务）
let metricsFrame = 0;
const scheduleScrollMetrics = () => {
  if (metricsFrame) return;
  metricsFrame = requestAnimationFrame(() => {
    metricsFrame = 0;
    updateScrollMetrics();
  });
};

// 程序化 setContent 后 RO 通知要等一次渲染时机、滚动条会滞后到用户滚动才出现，所以此处同步补测（内容入口低频，不需 rAF 合并）
const applyContent = (json: NodeJSON) => {
  editor.setContent(json);
  updateScrollMetrics();
};

// 编辑时实时跟随块高
useDocChange(
  () => {
    syncAutoHeight();
    scheduleScrollMetrics();
    scheduleRefreshTextSelection();
    scheduleRefreshTextSelectionToolbar();
  },
  { editor },
);

let contentResizeFrame = 0;
// 内容容器尺寸变化需重测度量；autoHeight 时还须重报块高，否则只测到占位高度、块高停在旧值
const onContentResize = () => {
  updateScrollMetrics();
  // 重排后选区矩形会跟着变，但不会触发 selectionchange，所以这里主动同步一次
  scheduleRefreshTextSelection();
  scheduleRefreshTextSelectionToolbar();
  if (!autoHeight.value || contentResizeFrame) return;
  // RO 回调里同步改块高会触发循环告警，所以延后一帧
  contentResizeFrame = requestAnimationFrame(() => {
    contentResizeFrame = 0;
    syncAutoHeight();
  });
};

// 仅 zoom 变化会重排内容、pan 纯平移每帧测量会卡顿，所以仅 zoom 变化时重测
let lastTransformZoom: number | null = null;
const onCanvasTransform = (e: Event) => {
  const z = (e as CustomEvent<{ zoom?: number }>).detail?.zoom;
  if (z == null || z === lastTransformZoom) return;
  lastTransformZoom = z;
  requestAnimationFrame(() => {
    syncAutoHeight();
    scheduleRefreshTextSelection();
    scheduleRefreshTextSelectionToolbar();
  });
};

onMounted(() => {
  // 插入组件只撑大内容容器、不改 .editor-scroll 自身盒子，所以须一并观测 editorMount
  const observer = new ResizeObserver(onContentResize);
  if (scrollRef.value) observer.observe(scrollRef.value);
  if (editorMount.value) {
    editor.mount(editorMount.value);
    editorMounted = true;
    syncReadOnly(readOnly.value);
    observer.observe(editorMount.value);
    if (richTextConfig.value.content) {
      applyContent(richTextConfig.value.content);
    }
    // 等 mount/setContent 完成后才能量，所以 rAF 后测一次
    requestAnimationFrame(() => {
      updateScrollMetrics();
      syncAutoHeight();
    });
  }
  window.addEventListener('Mindrizzle:canvas-transform', onCanvasTransform);
  window.addEventListener('keydown', onAltKeyDown);
  window.addEventListener('keyup', onAltKeyUp);
  window.addEventListener('mousedown', onTextSelectionMouseDown, true);
  window.addEventListener('pointerdown', onTouchSelectionPointerDown, true);
  window.addEventListener('pointerup', onPointerEnd, true);
  window.addEventListener('pointercancel', onPointerEnd, true);
  window.addEventListener('pointermove', onTextSelectionPointerMove, true);
  window.addEventListener('contextmenu', onTouchTextSelectionContextMenu, true);
  window.addEventListener('mouseup', onSelectionMouseUp);
  window.addEventListener('Mindrizzle:rich-text-context-format', onRichTextContextFormat);
  document.addEventListener('selectionchange', scheduleRefreshTextSelectionToolbar);
  // 移动端键盘弹出改的是 visualViewport，window.resize 不一定触发，工具栏与手柄要跟着重排
  window.visualViewport?.addEventListener('resize', scheduleRefreshTextSelectionToolbar, {
    passive: true,
  });
  window.addEventListener('resize', keepApplyCardInViewport);
  window.addEventListener('resize', scheduleRefreshTextSelectionToolbar, { passive: true });
  onUnmounted(() => observer.disconnect());
});

onUnmounted(() => {
  editorMounted = false;
  cancelToolbarHide();
  if (toolbarLayoutFrame) cancelAnimationFrame(toolbarLayoutFrame);
  toolbarLayoutFrame = 0;
  stopTouchSelectionAutoScroll();
  cancelTouchSelectionDragFrames();
  if (toolbarRefreshFrame) cancelAnimationFrame(toolbarRefreshFrame);
  toolbarRefreshFrame = 0;
  if (selectionRefreshFrame) cancelAnimationFrame(selectionRefreshFrame);
  selectionRefreshFrame = 0;
  if (handlesRefreshFrame) cancelAnimationFrame(handlesRefreshFrame);
  handlesRefreshFrame = 0;
  cachedScrollRect = null;
  touchSelectionHandleDrag = null;
  touchSelectionFingerDrag = null;
  isTouchPointerOnEditor.value = false;
  if (metricsFrame) cancelAnimationFrame(metricsFrame);
  metricsFrame = 0;
  if (contentResizeFrame) cancelAnimationFrame(contentResizeFrame);
  contentResizeFrame = 0;
  stopScrollbarDrag();
  editor.unmount();
  window.removeEventListener('Mindrizzle:canvas-transform', onCanvasTransform);
  window.removeEventListener('keydown', onAltKeyDown);
  window.removeEventListener('keyup', onAltKeyUp);
  window.removeEventListener('mousedown', onTextSelectionMouseDown, true);
  window.removeEventListener('pointerdown', onTouchSelectionPointerDown, true);
  window.removeEventListener('pointerup', onPointerEnd, true);
  window.removeEventListener('pointercancel', onPointerEnd, true);
  window.removeEventListener('pointermove', onTextSelectionPointerMove, true);
  window.removeEventListener('contextmenu', onTouchTextSelectionContextMenu, true);
  window.removeEventListener('mouseup', onSelectionMouseUp);
  window.removeEventListener('Mindrizzle:rich-text-context-format', onRichTextContextFormat);
  document.removeEventListener('selectionchange', scheduleRefreshTextSelectionToolbar);
  window.visualViewport?.removeEventListener('resize', scheduleRefreshTextSelectionToolbar);
  window.removeEventListener('resize', keepApplyCardInViewport);
  window.removeEventListener('resize', scheduleRefreshTextSelectionToolbar);
});

// 开启瞬间按当前内容测一次
watch(autoHeight, (v) => {
  if (v) requestAnimationFrame(() => syncAutoHeight());
});

function importJSON(json: NodeJSON) {
  applyContent(json);
}

watch(
  () => richTextConfig.value.content,
  (v) => {
    if (v) applyContent(v as NodeJSON);
  },
);

defineExpose({
  commands: editor.commands,
  doc: editor.state.doc,
  importJSON,
  beginTouchTextSelection,
  extendTouchTextSelection,
  tapTouchTextSelection,
  endTouchTextSelection,
  resolveDropAtElement,
  scrollContent,
  getDocJSON() {
    return editor.state.doc.toJSON();
  },
  // 供父组件统一调用保存/加载，不按组件类型特判
  saveConfig() {
    return { content: editor.state.doc.toJSON() };
  },
  loadConfig(config: { content?: NodeJSON | null }) {
    if (config?.content) applyContent(config.content as NodeJSON);
  },
});
</script>

<style scoped>
/* 快照是克隆的组件 DOM，用 display:contents 让它像原来一样直接充当 .content-area 的 flex 子项 */
.virtual-snapshot {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会把指针事件吞进死 DOM，所以整棵子树穿透 */
.virtual-snapshot :deep(*) {
  pointer-events: none !important;
}

.editor-wrapper {
  position: relative;
  border: 1px solid transparent;
  border-radius: 4px;
  margin: 0px;
  /* 要为 popup 预留左右 gutter，所以用负边距扩展、overflow:visible 不触发滚动条 */
  margin-left: -64px;
  margin-right: -80px;
  padding-left: 64px;
  padding-right: 80px;
  width: 100%;
  box-sizing: content-box;

  height: 100%;
  overflow: visible;
  transition: border-color 0.15s ease;
  /* gutter 仅为视觉留白、保留命中会拦截画布框选，所以整体穿透，内容区单独恢复 */
  pointer-events: none;
}

/* 零宽滚动条：原生滚动条占位会与自定义轨道叠成两条，所以只保留滚动能力 */
.editor-scroll {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
  box-sizing: border-box;
  pointer-events: auto;
}
.editor-scroll::-webkit-scrollbar {
  display: none;
}

.editor-scroll-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 10px;
  grid-template-rows: minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.editor-wrapper.auto-height .editor-scroll-shell {
  height: auto;
}

.text-selection-handle-layer {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.text-selection-handle {
  position: absolute;
  display: block;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  transform: translateX(-50%);
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
}

.text-selection-handle::before,
.text-selection-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  background: rgb(var(--v-theme-primary));
  transform: translateX(-50%);
}

.text-selection-handle::before {
  top: 0;
  width: var(--touch-handle-stem-width);
  height: var(--touch-handle-stem-length);
  border-radius: 999px;
}

.text-selection-handle::after {
  top: calc(var(--touch-handle-stem-length) - var(--touch-handle-knob-size) / 2);
  width: var(--touch-handle-knob-size);
  height: var(--touch-handle-knob-size);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* 常显：不做“hover 才亮”的隐式提示，缩放下也能一眼看到可滚 */
.custom-scrollbar {
  position: relative;
  z-index: 6;
  pointer-events: auto;
  background: rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
}

.custom-scrollbar:hover,
.custom-scrollbar.force-hover {
  background: rgba(var(--v-theme-on-surface), 0.2);
}

/* 两端各留 2px 与 thumbGeometry 的 viewport - 4 对应 */
.custom-scrollbar-vertical {
  grid-column: 2;
  grid-row: 1;
  justify-self: center;
  width: 8px;
  margin: 2px 0;
}

.custom-scrollbar-horizontal {
  grid-column: 1;
  grid-row: 2;
  height: 8px;
  margin: 2px 0;
}

.custom-scrollbar-thumb {
  position: absolute;
  pointer-events: auto;
  background: rgba(var(--v-theme-on-surface), 0.5);
  border-radius: 4px;
  cursor: grab;
}

.custom-scrollbar-thumb:active {
  cursor: grabbing;
  background: rgba(var(--v-theme-on-surface), 0.62);
}

.custom-scrollbar-vertical .custom-scrollbar-thumb {
  top: 0;
  right: 0;
  left: 0;
}

.custom-scrollbar-horizontal .custom-scrollbar-thumb {
  top: 0;
  bottom: 0;
  left: 0;
}

/* height:100% 会把容器钳制到块高致缩短时测不到，所以解除钳制让容器随内容撑开 */
.editor-wrapper.auto-height .editor-scroll {
  height: auto;
}

.editor-mount {
  outline: none;
  /* 固定 100% 高度会使末行弹不出 popup，所以高度随内容增长 */
  min-height: 100%;
  width: 100%;
  pointer-events: auto;
}

.editor-mount:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

/* editor.mount 把 ProseMirror 挂在 .editor-mount 同一元素上（后代选择器恒不命中），所以改用同元素选择器；
   且不设 height:100%（固定高度会使末行弹不出 popup），min-height 沿用 .editor-mount 的 100% */
.editor-mount.ProseMirror {
  padding: 0;
  outline: none;
  pointer-events: auto;
  /* 只读下仍需可选中并复制文本 */
  user-select: text;
  /* 自绘选区 + 选区工具栏取代了原生长按菜单，避免移动端两套 UI 同时出现 */
  -webkit-touch-callout: none;
}

.editor-wrapper :deep(.block-handle-positioner.placement-top .block-handle-popup),
.editor-wrapper :deep(.block-handle-positioner.placement-bottom .block-handle-popup) {
  transform: translateY(var(--block-handle-shift, 0px));
}

/* v-overlay__content 尺寸为 0（inset 失效），所以用 vw/vh 显式铺满并置 z 高于 scrim */
.apply-layer {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1;
}
.apply-card {
  position: absolute;
  min-width: min(240px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
}
</style>
