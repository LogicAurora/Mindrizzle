<template>
  <svg class="annotation-svg" :style="{ zIndex: Z_LAYER.annotation }" aria-hidden="true">
    <g
      v-for="shape in renderedShapes"
      :key="shape.id"
      class="annotation-shape"
      :class="{ 'annotation-selected': shape.id === selectedId }"
      :style="colorStyleOf(shape)"
    >
      <path class="annotation-path" :d="shape.d" />
      <polygon v-if="shape.arrow" class="annotation-arrow" :points="shape.arrow" />
    </g>
    <g v-if="draftShape" class="annotation-shape" :style="colorStyleOf(draftShape)">
      <path class="annotation-path annotation-draft" :d="draftShape.d" />
      <polygon
        v-if="draftShape.arrow"
        class="annotation-arrow annotation-draft"
        :points="draftShape.arrow"
      />
    </g>
  </svg>
  <div class="annotation-text-layer" :style="{ zIndex: Z_LAYER.annotation }">
    <template v-for="item in textItems" :key="item.id">
      <div
        v-if="editingId !== item.id"
        class="annotation-text"
        :class="{ 'annotation-selected': item.id === selectedId }"
        :style="textStyleOf(item)"
      >
        {{ item.text }}
      </div>
    </template>
  </div>
  <Teleport to=".canvas-container" defer>
    <textarea
      v-if="editingItem"
      :ref="setEditorRef"
      class="annotation-text-editor"
      :style="editorStyle"
      :value="editingText"
      placeholder="输入文本"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
      @input="onTextInput"
      @blur="commitTextEdit"
      @keydown.esc.stop.prevent="cancelTextEdit"
      @keydown.ctrl.enter.stop.prevent="commitTextEdit"
    />
  </Teleport>
  <Teleport to=".canvas-container" defer>
    <div
      v-if="active"
      class="annotation-catcher"
      :class="{ 'annotation-catcher--select': tool === 'select' }"
      :style="{ zIndex: Z_LAYER.annotationCatcher }"
      @pointerdown="onPointerDown"
      @mousedown.stop
      @click.stop
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

import { generateBlockUuid } from '../../../utils/blockUuid.ts';
import type { Point } from '../../../utils/canvasCoords.ts';
import {
  arrowHeadOf,
  connectorPathOf,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
  hitAnnotationId,
  previewConnectorPath,
  type AnnotationBlock,
  type AnnotationConnector,
  type AnnotationItem,
  type AnnotationStroke,
  type AnnotationText,
  type AnnotationTool,
} from './annotationModel.ts';
import { Z_LAYER } from './zIndex.ts';

const props = defineProps<{
  items: AnnotationItem[];
  blocks: AnnotationBlock[];
  tool: AnnotationTool;
  active: boolean;
  zoom: number;
  color: string;
  selectedId: string | null;
  toContent: (clientX: number, clientY: number) => Point | null;
  toViewport: (x: number, y: number) => Point;
}>();

const emit = defineEmits<{
  create: [item: AnnotationItem];
  update: [item: AnnotationItem];
  erase: [id: string];
  select: [id: string | null];
}>();

interface RenderedShape {
  id: string;
  d: string;
  arrow: string | null;
  color?: string;
}

const ERASE_TOLERANCE = 10;
// 视觉上连续即可，所以按屏幕像素折算到 content 单位
const MIN_POINT_STEP = 2;

const draft = ref<AnnotationItem | null>(null);
const previewPoint = ref<Point | null>(null);
const textDraft = ref<AnnotationText | null>(null);
const editingId = ref<string | null>(null);
const editingText = ref('');
const editorEl = ref<HTMLTextAreaElement | null>(null);
let isDrawing = false;
let penRafId = 0;
let pendingPoint: Point | null = null;

const blockMap = computed(() => new Map(props.blocks.map(({ uuid, rect }) => [uuid, rect])));

const colorStyleOf = (shape: RenderedShape): Record<string, string> | undefined =>
  shape.color ? { '--annotation-color': shape.color } : undefined;

const strokeShapeOf = (item: AnnotationStroke): RenderedShape | null => {
  if (item.points.length < 2) return null;
  const d = item.points.map((point) => `${Math.round(point.x)} ${Math.round(point.y)}`).join(' L ');
  return { id: item.id, d: `M ${d}`, arrow: null, color: item.color };
};

const connectorShapeOf = (item: AnnotationConnector): RenderedShape | null => {
  const from = blockMap.value.get(item.fromUuid);
  const to = blockMap.value.get(item.toUuid);
  if (!from || !to) return null;
  const path = connectorPathOf(from, to, item);
  return {
    id: item.id,
    d: path.d,
    arrow: item.shape === 'arrow' ? arrowHeadOf(path) : null,
    color: item.color,
  };
};

const toRenderedShape = (item: AnnotationItem): RenderedShape | null => {
  if (item.kind === 'stroke') return strokeShapeOf(item);
  if (item.kind === 'connector') return connectorShapeOf(item);
  return null;
};

const renderedShapes = computed(() =>
  props.items.map(toRenderedShape).filter((shape): shape is RenderedShape => !!shape),
);

const textItems = computed<AnnotationText[]>(() => {
  const list = props.items.filter((item): item is AnnotationText => item.kind === 'text');
  return textDraft.value ? [...list, textDraft.value] : list;
});

const textStyleOf = (item: AnnotationText): Record<string, string> => {
  const style: Record<string, string> = {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.width ?? DEFAULT_TEXT_WIDTH}px`,
    fontSize: `${item.fontSize ?? DEFAULT_TEXT_FONT_SIZE}px`,
  };
  if (item.color) style['--annotation-color'] = item.color;
  return style;
};

const editingItem = computed<AnnotationText | null>(() => {
  const id = editingId.value;
  if (!id) return null;
  if (textDraft.value?.id === id) return textDraft.value;
  return (
    props.items.find((item): item is AnnotationText => item.kind === 'text' && item.id === id) ??
    null
  );
});

const editorStyle = computed<Record<string, string>>(() => {
  const item = editingItem.value;
  if (!item) return {};
  const point = props.toViewport(item.x, item.y);
  const style: Record<string, string> = {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${(item.width ?? DEFAULT_TEXT_WIDTH) * props.zoom}px`,
    fontSize: `${(item.fontSize ?? DEFAULT_TEXT_FONT_SIZE) * props.zoom}px`,
    zIndex: String(Z_LAYER.annotationEditor),
  };
  if (item.color) style['--annotation-color'] = item.color;
  return style;
});

const setEditorRef = (el: unknown) => {
  editorEl.value = el instanceof HTMLTextAreaElement ? el : null;
};

const syncEditorHeight = (el: HTMLTextAreaElement) => {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

const focusEditor = async () => {
  await nextTick();
  const el = editorEl.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  syncEditorHeight(el);
};

const beginTextEdit = (item: AnnotationText) => {
  editingId.value = item.id;
  editingText.value = item.text;
  void focusEditor();
};

const onTextInput = (event: Event) => {
  const el = event.target as HTMLTextAreaElement;
  editingText.value = el.value;
  syncEditorHeight(el);
};

const finishTextEdit = (commit: boolean) => {
  const id = editingId.value;
  if (!id) return;
  editingId.value = null;
  const value = commit ? editingText.value.trim() : '';
  editingText.value = '';
  const draftItem = textDraft.value;
  textDraft.value = null;
  if (draftItem?.id === id) {
    if (value) emit('create', { ...draftItem, text: value });
    return;
  }
  const existing = props.items.find(
    (item): item is AnnotationText => item.kind === 'text' && item.id === id,
  );
  if (!existing) return;
  if (!value) emit('erase', id);
  else if (value !== existing.text) emit('update', { ...existing, text: value });
};

const commitTextEdit = () => finishTextEdit(true);
const cancelTextEdit = () => finishTextEdit(false);

const draftShape = computed<RenderedShape | null>(() => {
  const item = draft.value;
  if (!item) return null;
  if (item.kind === 'stroke') return strokeShapeOf(item);
  if (item.kind !== 'connector') return null;
  const point = previewPoint.value;
  const from = blockMap.value.get(item.fromUuid);
  if (!point || !from) return null;
  const path = previewConnectorPath(from, point, item);
  return {
    id: item.id,
    d: path.d,
    arrow: item.shape === 'arrow' ? arrowHeadOf(path) : null,
    color: item.color,
  };
});

// 命中测试按 z 从高到低找，blocks 由画布按层级升序传入
const blockAtPoint = (point: Point): AnnotationBlock | null => {
  for (let i = props.blocks.length - 1; i >= 0; i--) {
    const { uuid, rect } = props.blocks[i];
    const isInside =
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h;
    if (isInside) return { uuid, rect };
  }
  return null;
};

const hitInputOf = (point: Point) => ({
  items: props.items,
  point,
  tolerance: ERASE_TOLERANCE / props.zoom,
  blockMap: blockMap.value,
});

const eraseAt = (point: Point) => {
  const id = hitAnnotationId(hitInputOf(point));
  if (id) emit('erase', id);
};

const flushPenPoint = () => {
  penRafId = 0;
  const point = pendingPoint;
  pendingPoint = null;
  const item = draft.value;
  if (!item || item.kind !== 'stroke' || !point) return;
  const last = item.points[item.points.length - 1];
  if (Math.hypot(point.x - last.x, point.y - last.y) * props.zoom < MIN_POINT_STEP) return;
  item.points.push(point);
};

const queuePenPoint = (point: Point) => {
  pendingPoint = point;
  if (penRafId) return;
  penRafId = requestAnimationFrame(flushPenPoint);
};

const startDraw = (point: Point) => {
  isDrawing = true;
  if (props.tool === 'pen') {
    draft.value = {
      id: generateBlockUuid(),
      kind: 'stroke',
      points: [point],
      color: props.color,
    };
    return;
  }
  const shape = props.tool;
  if (shape === 'eraser' || shape === 'select' || shape === 'text') {
    isDrawing = false;
    return;
  }
  const from = blockAtPoint(point);
  if (!from) {
    isDrawing = false;
    return;
  }
  draft.value = {
    id: generateBlockUuid(),
    kind: 'connector',
    shape,
    fromUuid: from.uuid,
    toUuid: '',
    color: props.color,
  };
  previewPoint.value = point;
};

// useHoverState 在 zoom≠1 时会在 window 捕获阶段 stopPropagation 掉真实 pointermove，
// 元素级监听收不到移动，所以绘制会话期间改挂 window 捕获阶段（同节点捕获监听不受 stopPropagation 影响）
const watchDrawSession = () => {
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
};

const unwatchDrawSession = () => {
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('pointerup', onPointerUp, true);
  window.removeEventListener('pointercancel', onPointerUp, true);
};

const onPointerDown = (e: PointerEvent) => {
  if (!props.active || e.button !== 0) return;
  const point = props.toContent(e.clientX, e.clientY);
  if (!point) return;
  e.preventDefault();
  // 正在编辑时先提交并吃掉本次按下，避免同一次点击穿透去新建文本或触发画布/块操作
  if (editingId.value) {
    finishTextEdit(true);
    return;
  }
  if (props.tool === 'select') {
    emit('select', hitAnnotationId(hitInputOf(point)));
    return;
  }
  if (props.tool === 'text') {
    const hitId = hitAnnotationId(hitInputOf(point));
    const hitItem = hitId ? props.items.find((item) => item.id === hitId) : null;
    if (hitItem?.kind === 'text') {
      beginTextEdit(hitItem);
      return;
    }
    const textItem: AnnotationText = {
      id: generateBlockUuid(),
      kind: 'text',
      x: point.x,
      y: point.y,
      text: '',
      color: props.color,
    };
    textDraft.value = textItem;
    beginTextEdit(textItem);
    return;
  }
  const catcher = e.currentTarget;
  // 合成事件的 pointerId 没有活跃指针，捕获会抛错；失败时依旧靠 window 监听收尾
  if (catcher instanceof HTMLElement) {
    try {
      catcher.setPointerCapture(e.pointerId);
    } catch {
      // 忽略，不影响主流程
    }
  }
  if (props.tool === 'eraser') {
    isDrawing = true;
    eraseAt(point);
  } else {
    startDraw(point);
  }
  if (isDrawing) watchDrawSession();
};

const onPointerMove = (e: PointerEvent) => {
  if (!isDrawing) return;
  const point = props.toContent(e.clientX, e.clientY);
  if (!point) return;
  if (props.tool === 'eraser') {
    eraseAt(point);
    return;
  }
  const item = draft.value;
  if (!item) return;
  if (item.kind === 'stroke') queuePenPoint(point);
  else if (item.kind === 'connector') previewPoint.value = point;
};

const onPointerUp = (e: PointerEvent) => {
  if (!isDrawing) return;
  isDrawing = false;
  unwatchDrawSession();
  flushPenPoint();
  const item = draft.value;
  draft.value = null;
  previewPoint.value = null;
  if (!item) return;
  if (item.kind === 'stroke') {
    if (item.points.length >= 2) emit('create', item);
    return;
  }
  if (item.kind !== 'connector') return;
  const point = props.toContent(e.clientX, e.clientY);
  const target = point ? blockAtPoint(point) : null;
  if (target && target.uuid !== item.fromUuid) emit('create', { ...item, toUuid: target.uuid });
};

// 切工具/退出批注时输入框会失焦，但仍兜底提交一次，避免草稿丢失
watch(
  () => props.tool,
  (tool) => {
    if (editingId.value && tool !== 'text') commitTextEdit();
  },
);
watch(
  () => props.active,
  (active) => {
    if (!active) commitTextEdit();
  },
);

onUnmounted(() => {
  unwatchDrawSession();
  if (penRafId) cancelAnimationFrame(penRafId);
  if (editingId.value) finishTextEdit(false);
});
</script>

<style scoped>
.annotation-svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.annotation-path {
  fill: none;
  stroke: var(--annotation-color, rgb(var(--v-theme-error)));
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.annotation-arrow {
  fill: var(--annotation-color, rgb(var(--v-theme-error)));
}

.annotation-selected .annotation-path {
  stroke-width: 3.5;
}

.annotation-selected {
  filter: drop-shadow(0 0 3px rgb(var(--v-theme-primary) / 0.9));
}

.annotation-draft {
  opacity: 0.6;
  stroke-dasharray: 6 4;
}

.annotation-catcher {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}

.annotation-catcher--select {
  cursor: default;
}

.annotation-text-layer {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

.annotation-text {
  position: absolute;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  color: var(--annotation-color, rgb(var(--v-theme-error)));
}

.annotation-text-editor {
  position: absolute;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px dashed rgb(var(--v-theme-primary));
  border-radius: 2px;
  outline: none;
  background: rgb(var(--v-theme-surface));
  color: var(--annotation-color, rgb(var(--v-theme-error)));
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  pointer-events: auto;
}
</style>
