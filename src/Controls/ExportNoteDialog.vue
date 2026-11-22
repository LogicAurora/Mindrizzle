<template>
  <v-dialog v-model="isOpen" max-width="1180" scrollable persistent>
    <v-card class="export-dialog">
      <v-toolbar density="compact" color="transparent">
        <v-icon :icon="mode === 'html' ? mdiLanguageHtml5 : mdiFilePdfBox" class="ms-2 me-3" />
        <v-toolbar-title class="text-subtitle-1">
          {{ mode === 'html' ? '导出为 HTML' : '导出为 PDF' }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn :icon="mdiClose" variant="text" @click="close" />
      </v-toolbar>

      <v-divider />

      <div class="export-dialog__body">
        <div v-if="stage === 'loading'" class="export-dialog__placeholder">
          <v-progress-circular indeterminate color="primary" />
          <span>正在准备导出预览…</span>
        </div>
        <div v-else-if="stage === 'error'" class="export-dialog__placeholder">
          <v-icon :icon="mdiAlertCircleOutline" color="error" size="40" />
          <span class="text-error">{{ errorText || '导出预览生成失败' }}</span>
          <v-btn size="small" variant="tonal" @click="prepare">重试</v-btn>
        </div>
        <iframe
          v-else-if="mode === 'html'"
          class="export-dialog__frame"
          :srcdoc="htmlDocument"
          sandbox="allow-scripts"
          title="HTML 导出预览"
        />
        <div v-else class="export-dialog__pdf">
          <div class="export-dialog__pdf-zoom">
            <v-btn
              :icon="mdiMagnifyMinus"
              size="x-small"
              variant="text"
              title="缩小预览"
              @click="previewZoom = Math.max(MIN_PREVIEW_ZOOM, previewZoom - 0.1)"
            />
            <span>{{ Math.round(previewZoom * 100) }}%</span>
            <v-btn
              :icon="mdiMagnifyPlus"
              size="x-small"
              variant="text"
              title="放大预览"
              @click="previewZoom = Math.min(MAX_PREVIEW_ZOOM, previewZoom + 0.1)"
            />
          </div>
          <div class="export-dialog__pdf-scroll">
            <div class="mdr-pdf-preview" :style="{ zoom: previewZoom }">
              <div v-html="pdfPagesHtml"></div>
            </div>
          </div>
        </div>
      </div>

      <v-divider />

      <v-card-actions class="export-dialog__actions">
        <span class="text-caption text-medium-emphasis">
          {{
            mode === 'html'
              ? '导出的网页为只读画布，可直接分享；支持拖动平移、滚轮缩放与按键提示。'
              : `共 ${pdfPageCount} 页，按 A4 纵向排版；打印对话框中选择“另存为 PDF”。`
          }}
        </span>
        <v-spacer />
        <v-btn @click="close">取消</v-btn>
        <v-btn
          color="primary"
          :disabled="stage !== 'ready'"
          :loading="isExporting"
          :prepend-icon="mode === 'html' ? mdiDownload : mdiPrinterOutline"
          @click="onExport"
        >
          {{ mode === 'html' ? '保存 HTML 文件' : '打印 / 另存为 PDF' }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <div v-if="needsInternalRender" class="export-dialog__offscreen" aria-hidden="true">
      <MdrCanvas ref="canvasRef" />
    </div>
  </v-dialog>

  <v-snackbar v-model="isHintOpen" color="success" location="top" timeout="2600">
    {{ hintText }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  mdiAlertCircleOutline,
  mdiClose,
  mdiDownload,
  mdiFilePdfBox,
  mdiLanguageHtml5,
  mdiMagnifyMinus,
  mdiMagnifyPlus,
  mdiPrinterOutline,
} from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { error as logError } from '@tauri-apps/plugin-log';

import MdrCanvas from './Canvas/Core/MdrCanvas.vue';
import { fileOperations, noteFileLocationOf } from '../fileOperations';
import type { EditorNoteRef } from '../utils/editorRoute';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getCurrentNote, setCurrentNote } from '../utils/noteContext';
import { collectDocumentStyles } from '../utils/noteExport/exportAssets';
import { buildHtmlDocument } from '../utils/noteExport/exportHtml';
import {
  buildPdfPages,
  ensurePdfPreviewStyles,
  printPdfPages,
} from '../utils/noteExport/exportPdf';
import { saveHtmlFile } from '../utils/noteExport/saveExport';
import type { ExportCanvasSnapshot, ExportFormat } from '../utils/noteExport/types';

const props = defineProps<{
  modelValue: boolean;
  mode: ExportFormat;
  note: EditorNoteRef;
  title?: string;
  /** 编辑页直接复用已加载的画布，避免二次挂载与漏掉未保存修改 */
  snapshotProvider?: (() => Promise<ExportCanvasSnapshot>) | null;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

type Stage = 'idle' | 'loading' | 'ready' | 'error';

const DEFAULT_PREVIEW_ZOOM = 0.62;
const MIN_PREVIEW_ZOOM = 0.3;
const MAX_PREVIEW_ZOOM = 1.2;

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const canvasRef = ref<InstanceType<typeof MdrCanvas> | null>(null);
const stage = ref<Stage>('idle');
const errorText = ref('');
const htmlDocument = ref('');
const pdfPagesHtml = ref('');
const pdfPageCount = ref(0);
const previewZoom = ref(DEFAULT_PREVIEW_ZOOM);
const isExporting = ref(false);
const isHintOpen = ref(false);
const hintText = ref('');

const prepareToken = ref(0);
const needsInternalRender = computed(
  () => !props.snapshotProvider && isOpen.value && stage.value === 'loading',
);
const exportTitle = computed(() => props.title?.trim() || props.note.fileName || '未命名笔记');

function reset() {
  prepareToken.value += 1;
  stage.value = 'idle';
  errorText.value = '';
  htmlDocument.value = '';
  pdfPagesHtml.value = '';
  pdfPageCount.value = 0;
  previewZoom.value = DEFAULT_PREVIEW_ZOOM;
}

async function renderFromDisk(): Promise<ExportCanvasSnapshot> {
  const previousNote = getCurrentNote();
  setCurrentNote(props.note);
  try {
    await nextTick();
    const canvas = canvasRef.value;
    if (!canvas) throw new Error('预览画布尚未就绪');
    canvas.isEditMode = false;
    const body = await fileOperations.getNoteBody(noteFileLocationOf(props.note));
    await canvas.load(body.content ?? '');
    return await canvas.buildExportSnapshot();
  } finally {
    setCurrentNote(previousNote);
  }
}

function applySnapshot(snapshot: ExportCanvasSnapshot) {
  if (props.mode === 'html') {
    htmlDocument.value = buildHtmlDocument({
      title: exportTitle.value,
      appCss: collectDocumentStyles(),
      snapshot,
    });
    return;
  }
  ensurePdfPreviewStyles();
  const pages = buildPdfPages(snapshot, exportTitle.value);
  pdfPagesHtml.value = pages.html;
  pdfPageCount.value = pages.pageCount;
}

async function prepare() {
  reset();
  const token = prepareToken.value;
  stage.value = 'loading';
  try {
    const snapshot = props.snapshotProvider
      ? await props.snapshotProvider()
      : await renderFromDisk();
    if (token !== prepareToken.value) return;
    applySnapshot(snapshot);
    stage.value = 'ready';
  } catch (error) {
    if (token !== prepareToken.value) return;
    stage.value = 'error';
    errorText.value = getErrorMessage(error);
    if (isTauri()) void logError(`导出预览失败：${errorText.value}`);
  }
}

function close() {
  isOpen.value = false;
}

async function onExport() {
  isExporting.value = true;
  try {
    if (props.mode === 'html') {
      const path = await saveHtmlFile(exportTitle.value, htmlDocument.value);
      if (!path) return;
      hintText.value = `已保存到 ${path}`;
    } else {
      await printPdfPages(pdfPagesHtml.value);
      hintText.value = '已打开打印对话框，选择“另存为 PDF”即可保存';
    }
    isHintOpen.value = true;
  } catch (error) {
    hintText.value = `导出失败：${getErrorMessage(error)}`;
    isHintOpen.value = true;
    if (isTauri()) void logError(`导出失败：${hintText.value}`);
  } finally {
    isExporting.value = false;
  }
}

// 便签集用 v-if 挂载，首次打开时 modelValue 已经是 true，必须立即执行
watch(
  () => props.modelValue,
  (open) => {
    if (open) void prepare();
    else reset();
  },
  { immediate: true },
);
</script>

<style scoped>
.export-dialog {
  display: flex;
  flex-direction: column;
  /* Vuetify 可滚动对话框把卡片设成 flex:1 1 100%，不解除收缩会被压成页头页脚高度 */
  flex: 0 0 auto;
  height: min(90vh, 900px);
  max-height: 90vh;
}

.export-dialog__body {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #eef1f5;
  overflow: hidden;
}

.export-dialog__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  font-size: 13px;
  color: rgb(var(--v-theme-on-surface-variant));
}

.export-dialog__frame {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.export-dialog__pdf {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.export-dialog__pdf-zoom {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 36px;
  padding: 0 12px;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 12px;
}

.export-dialog__pdf-scroll {
  flex: 1;
  overflow: auto;
}

.export-dialog__actions {
  gap: 12px;
  padding: 8px 16px;
}

.export-dialog__offscreen {
  position: fixed;
  left: -20000px;
  top: 0;
  display: flex;
  flex-direction: column;
  width: 1280px;
  height: 900px;
}
</style>
