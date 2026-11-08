<template>
  <svg class="annotation-svg" :style="{ zIndex: Z_LAYER.annotation }" aria-hidden="true">
    <template v-for="shape in renderedShapes" :key="shape.id">
      <path class="annotation-path" :d="shape.d" />
      <polygon v-if="shape.arrow" class="annotation-arrow" :points="shape.arrow" />
    </template>
    <template v-if="draftShape">
      <path class="annotation-path annotation-draft" :d="draftShape.d" />
      <polygon
        v-if="draftShape.arrow"
        class="annotation-arrow annotation-draft"
        :points="draftShape.arrow"
      />
    </template>
  </svg>
  <Teleport to=".canvas-container" defer>
    <div
      v-if="active"
      class="annotation-catcher"
      :style="{ zIndex: Z_LAYER.annotationCatcher }"
      @pointerdown="onPointerDown"
      @mousedown.stop
      @click.stop
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';

import { generateBlockUuid } from '../../../utils/blockUuid.ts';
import type { Point } from '../../../utils/canvasCoords.ts';
import {
  arrowHeadOf,
  connectorPathOf,
  hitAnnotationId,
  previewConnectorPath,
  type AnnotationBlock,
  type AnnotationConnector,
  type AnnotationItem,
  type AnnotationStroke,
  type AnnotationTool,
} from './annotationModel.ts';
import { Z_LAYER } from './zIndex.ts';

const props = defineProps<{
  items: AnnotationItem[];
  blocks: AnnotationBlock[];
  tool: AnnotationTool;
  active: boolean;
  zoom: number;
  toContent: (clientX: number, clientY: number) => Point | null;
}>();

const emit = defineEmits<{
  create: [item: AnnotationItem];
  erase: [id: string];
}>();

interface RenderedShape {
  id: string;
  d: string;
  arrow: string | null;
}

const ERASE_TOLERANCE = 10;
// 视觉上连续即可，所以按屏幕像素折算到 content 单位
const MIN_POINT_STEP = 2;

const draft = ref<AnnotationItem | null>(null);
const previewPoint = ref<Point | null>(null);
let isDrawing = false;
let penRafId = 0;
let pendingPoint: Point | null = null;

const blockMap = computed(() => new Map(props.blocks.map(({ uuid, rect }) => [uuid, rect])));

const strokeShapeOf = (item: AnnotationStroke): RenderedShape | null => {
  if (item.points.length < 2) return null;
  const d = item.points.map((point) => `${Math.round(point.x)} ${Math.round(point.y)}`).join(' L ');
  return { id: item.id, d: `M ${d}`, arrow: null };
};

const connectorShapeOf = (item: AnnotationConnector): RenderedShape | null => {
  const from = blockMap.value.get(item.fromUuid);
  const to = blockMap.value.get(item.toUuid);
  if (!from || !to) return null;
  const path = connectorPathOf(from, to, item.shape);
  return {
    id: item.id,
    d: path.d,
    arrow: item.shape === 'arrow' ? arrowHeadOf(path) : null,
  };
};

const toRenderedShape = (item: AnnotationItem): RenderedShape | null =>
  item.kind === 'stroke' ? strokeShapeOf(item) : connectorShapeOf(item);

const renderedShapes = computed(() =>
  props.items.map(toRenderedShape).filter((shape): shape is RenderedShape => !!shape),
);

const draftShape = computed<RenderedShape | null>(() => {
  const item = draft.value;
  if (!item) return null;
  if (item.kind === 'stroke') return strokeShapeOf(item);
  const point = previewPoint.value;
  const from = blockMap.value.get(item.fromUuid);
  if (!point || !from) return null;
  const path = previewConnectorPath(from, point, item.shape);
  return {
    id: item.id,
    d: path.d,
    arrow: item.shape === 'arrow' ? arrowHeadOf(path) : null,
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

const eraseAt = (point: Point) => {
  const id = hitAnnotationId({
    items: props.items,
    point,
    tolerance: ERASE_TOLERANCE / props.zoom,
    blockMap: blockMap.value,
  });
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
    draft.value = { id: generateBlockUuid(), kind: 'stroke', points: [point] };
    return;
  }
  const shape = props.tool;
  if (shape === 'eraser') {
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
  else previewPoint.value = point;
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
  const point = props.toContent(e.clientX, e.clientY);
  const target = point ? blockAtPoint(point) : null;
  if (target && target.uuid !== item.fromUuid) emit('create', { ...item, toUuid: target.uuid });
};

onUnmounted(() => {
  unwatchDrawSession();
  if (penRafId) cancelAnimationFrame(penRafId);
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
  stroke: rgb(var(--v-theme-error));
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.annotation-arrow {
  fill: rgb(var(--v-theme-error));
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
</style>
