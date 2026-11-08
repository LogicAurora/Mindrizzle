<template>
  <BlockShell>
    <section class="mermaid-block">
      <header class="mermaid-toolbar" @mousedown.stop>
        <span class="mermaid-title">Mermaid</span>
        <div class="mermaid-actions">
          <template v-if="!isEditing">
            <v-btn
              size="x-small"
              variant="text"
              :icon="mdiMagnifyMinusOutline"
              aria-label="缩小图表"
              :disabled="zoom <= MIN_ZOOM"
              @click="changeZoom(-ZOOM_STEP)"
            />
            <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
            <v-btn
              size="x-small"
              variant="text"
              :icon="mdiMagnifyPlusOutline"
              aria-label="放大图表"
              :disabled="zoom >= MAX_ZOOM"
              @click="changeZoom(ZOOM_STEP)"
            />
            <v-btn
              size="x-small"
              variant="text"
              :icon="mdiFitToScreen"
              aria-label="重置视图"
              @click="resetView"
            />
            <v-btn
              size="x-small"
              variant="text"
              :icon="mdiDownloadOutline"
              aria-label="导出 PNG"
              :disabled="!hasDiagram || isRendering || isExporting"
              :loading="isExporting"
              @click="exportPng"
            />
          </template>
          <v-btn size="small" variant="text" @click="isEditing = !isEditing">
            {{ isEditing ? '预览图表' : '编辑源码' }}
          </v-btn>
        </div>
      </header>

      <textarea
        v-if="isEditing"
        class="mermaid-source"
        :value="code"
        :readonly="ctx.readOnly"
        spellcheck="false"
        aria-label="Mermaid 源码"
        @input="onCodeInput"
      />
      <div
        v-else
        ref="previewRef"
        class="mermaid-preview"
        :class="{ 'is-panning': isPanning }"
        role="img"
        aria-label="Mermaid 图表预览，可拖动平移"
        @mousedown.stop
        @pointerdown.stop="startPan"
        @pointermove.stop="movePan"
        @pointerup.stop="endPan"
        @pointercancel.stop="endPan"
      >
        <div class="mermaid-diagram" :style="diagramStyle" v-html="diagramSvg" />
      </div>

      <p v-if="renderError" class="mermaid-error" role="alert">图表语法错误：{{ renderError }}</p>
      <p v-if="exportError" class="mermaid-error" role="alert">{{ exportError }}</p>
    </section>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  mdiDownloadOutline,
  mdiFitToScreen,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
} from '@mdi/js';

import type { MermaidBlockConfig } from '../Registry/canvasComponents.ts';
import BlockShell from '../Sdk/BlockShell.vue';
import { useBlockContext } from '../Sdk/blockContext.ts';
import { exportSvgAsPng } from './MermaidBlock/exportPng.ts';
import { renderMermaid } from './MermaidBlock/mermaidRenderer.ts';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const EXPORT_FILE_NAME = 'mermaid-diagram.png';

const ctx = useBlockContext<MermaidBlockConfig>();
const code = computed(() => String(ctx.config.code ?? ''));
const isEditing = ref(false);
const diagramSvg = ref('');
const renderError = ref('');
const exportError = ref('');
const previewRef = ref<HTMLElement | null>(null);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const isRendering = ref(false);
const isExporting = ref(false);
let renderRevision = 0;
let panPointerId: number | null = null;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

const hasDiagram = computed(() => Boolean(diagramSvg.value));
const diagramStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
}));

const renderDiagram = async (source: string) => {
  const revision = ++renderRevision;
  isRendering.value = true;
  renderError.value = '';
  try {
    const svg = await renderMermaid(source);
    if (revision === renderRevision) diagramSvg.value = svg;
  } catch (error) {
    if (revision !== renderRevision) return;
    diagramSvg.value = '';
    renderError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (revision === renderRevision) isRendering.value = false;
  }
};

const onCodeInput = (event: Event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLTextAreaElement)) return;
  ctx.setConfig({ code: input.value });
};

const changeZoom = (delta: number) => {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value + delta));
};

const resetView = () => {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
};

const startPan = (event: PointerEvent) => {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  panPointerId = event.pointerId;
  panStart = { x: event.clientX, y: event.clientY };
  panOrigin = { ...pan.value };
  isPanning.value = true;
};

const movePan = (event: PointerEvent) => {
  if (event.pointerId !== panPointerId) return;
  pan.value = {
    x: panOrigin.x + event.clientX - panStart.x,
    y: panOrigin.y + event.clientY - panStart.y,
  };
};

const endPan = (event: PointerEvent) => {
  if (event.pointerId !== panPointerId) return;
  panPointerId = null;
  isPanning.value = false;
};

const exportPng = async () => {
  const svg = previewRef.value?.querySelector('svg');
  if (!svg) return;
  isExporting.value = true;
  exportError.value = '';
  try {
    await exportSvgAsPng(svg, EXPORT_FILE_NAME);
  } catch (error) {
    exportError.value = `导出 PNG 失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    isExporting.value = false;
  }
};

watch(code, renderDiagram, { immediate: true });
onBeforeUnmount(() => {
  renderRevision++;
});
</script>

<style scoped>
.mermaid-block {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.mermaid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 12px;
}

.mermaid-title {
  flex: 0 0 auto;
}

.mermaid-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.zoom-label {
  min-width: 36px;
  text-align: center;
  font-size: 11px;
}

.mermaid-source {
  flex: 1;
  min-height: 0;
  padding: 12px;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: inherit;
  font: 12px/1.5 monospace;
  tab-size: 2;
}

.mermaid-preview {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: clip;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.mermaid-preview.is-panning {
  cursor: grabbing;
}

.mermaid-diagram {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center;
}

.mermaid-preview :deep(svg) {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
}

.mermaid-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  color: rgb(var(--v-theme-error));
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
