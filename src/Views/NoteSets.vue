<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { mdiNoteOffOutline, mdiPencil, mdiPlus } from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { info } from '@tauri-apps/plugin-log';

import NewFileDialog from '../Controls/NewFileDialog.vue';
import { loadEditorComponent, storePendingEditorBody, type EditorBodyResult } from '../utils/editorRoute'
import { invokeCommand } from '../utils/invoke'
import { loadNoteSetEntries, type NoteSetEntry } from '../utils/noteSetStore'
import { isDebugLoadingEnabled, noteLoadControllerKey, startEditorTransitionKey } from '../utils/routeTransition'

const startEditorTransition = inject(startEditorTransitionKey)!
const noteLoadController = inject(noteLoadControllerKey)!
let editorPreload: Promise<unknown> | undefined

function preloadEditor() {
  if (editorPreload) return editorPreload
  // 预加载失败不影响点击时由路由重新加载
  editorPreload = loadEditorComponent().catch(() => undefined)
  return editorPreload
}

async function prepareEditor(fileName: string) {
  noteLoadController.setName(fileName)
  let unlisten: (() => void) | undefined
  if (isTauri()) {
    unlisten = await listen<number>('file-load-progress', (event) => {
      noteLoadController.setProgress(event.payload)
    })
  }
  const bodyPromise: Promise<EditorBodyResult> = invokeCommand<{ content: string }>('get_mdr_file_body', {
    fileName,
    debugProgress: isDebugLoadingEnabled.value,
  }).then(
    (body) => ({ content: body.content ?? '' }),
    (error: unknown) => ({ error }),
  )
  storePendingEditorBody(fileName, bodyPromise)
  try {
    await Promise.all([preloadEditor(), bodyPromise])
  } finally {
    unlisten?.()
  }
}

async function openEditor(noteSet: NoteSetItem) {
  noteSet.loading = true
  try {
    await startEditorTransition(
      { name: 'editor', params: { fileName: noteSet.fileName } },
      () => prepareEditor(noteSet.fileName),
    )
  } finally {
    noteSet.loading = false
  }
}

const isCreateDialogOpen = ref(false)

const INITIAL_VISIBLE_COUNT = 12
const VISIBLE_BATCH_SIZE = 12
const SKELETON_COUNT = 6
const SENTINEL_MARGIN_PX = 240

type NoteSetItem = NoteSetEntry & { loading: boolean }

const isError = ref(false);
const isLoading = ref(true);
const noteSets = ref<NoteSetItem[]>([]);
const visibleCount = ref(INITIAL_VISIBLE_COUNT);
const listSentinel = ref<HTMLElement | null>(null);
const visibleNoteSets = computed(() => noteSets.value.slice(0, visibleCount.value));

// 一次性建几百张卡片会把首屏主线程占满，所以按需追加
function growVisibleNoteSets() {
  visibleCount.value = Math.min(visibleCount.value + VISIBLE_BATCH_SIZE, noteSets.value.length);
}

let listObserver: IntersectionObserver | null = null;

// 哨兵一直留在视口内时观察器不会再次回调，所以主动把视口填满
async function fillListViewport(): Promise<void> {
  const sentinel = listSentinel.value;
  if (!sentinel || visibleCount.value >= noteSets.value.length) return;
  await nextTick();
  if (sentinel.getBoundingClientRect().top > window.innerHeight + SENTINEL_MARGIN_PX) return;
  growVisibleNoteSets();
  await fillListViewport();
}

onMounted(() => {
  listObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    growVisibleNoteSets();
    void fillListViewport();
  }, { rootMargin: `${SENTINEL_MARGIN_PX}px` });
});

watch(listSentinel, (sentinel) => {
  listObserver?.disconnect();
  if (sentinel) listObserver?.observe(sentinel);
});

onBeforeUnmount(() => {
  listObserver?.disconnect();
  listObserver = null;
});

const MILLIS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;

const relativeTime = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

// Date 只有绝对时间，所以按分钟/小时/天折算，超过一月退回日期
function formatUpdatedAt(timestamp: number): string {
  if (!timestamp) return '未知';
  const minutes = Math.round((timestamp - Date.now()) / MILLIS_PER_MINUTE);
  if (Math.abs(minutes) < MINUTES_PER_HOUR) return relativeTime.format(minutes, 'minute');
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (Math.abs(hours) < HOURS_PER_DAY) return relativeTime.format(hours, 'hour');
  const days = Math.round(hours / HOURS_PER_DAY);
  if (Math.abs(days) < DAYS_PER_MONTH) return relativeTime.format(days, 'day');
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

async function loadNoteSets() {
  try {
    const entries = await loadNoteSetEntries();
    noteSets.value = entries.map((entry) => ({ ...entry, loading: false }));
    // 网页端无 IPC，日志插件的 invoke 会抛错
    if (isTauri()) info(`读取笔记元信息成功，共 ${noteSets.value.length} 条`)
  } catch (error) {
    isError.value = true;
  } finally {
    isLoading.value = false;
  }
}

loadNoteSets();
</script>
<template>
  <v-sheet class="pa-4" elevation="0">
    <v-snackbar v-model="isError" timeout="2000">
      Oh no!便签怎么皱成一团了！
    </v-snackbar>
    <template v-if="isLoading">
      <v-skeleton-loader v-for="index in SKELETON_COUNT" :key="index" type="card" class="mb-4" />
    </template>
    <v-empty-state v-else-if="noteSets.length === 0"
    :icon="mdiNoteOffOutline"
    title = "还没有便签……"
    text = "点击右下角的 + 按钮创建新的便签集" />
    <v-list v-else class="overflow-visible">
      <v-card v-for="noteSet in visibleNoteSets" :key="noteSet.fileName" class="mb-4">
        <v-card-title>
          {{ noteSet.name }}
        </v-card-title>
        <v-card-subtitle>
          上次编辑：{{ formatUpdatedAt(noteSet.updatedAt) }}
        </v-card-subtitle>
        <v-card-text>
          {{ noteSet.description }}
        </v-card-text>
        <v-card-actions>
          <v-btn
            @click="openEditor(noteSet)"
            @pointerenter="preloadEditor"
            @focus="preloadEditor"
            :icon="mdiPencil"
            :loading="noteSet.loading"
            class="ms-2"
            variant="text"
          ></v-btn>
        </v-card-actions>
      </v-card>
      <div ref="listSentinel" />
    </v-list>
    <v-fab
      :icon="mdiPlus"
      color="primary"
      location="bottom end"
      app
      @click="isCreateDialogOpen = true"
    />
    <NewFileDialog :is-open="isCreateDialogOpen" @update:close="isCreateDialogOpen = $event.status" />
  </v-sheet>
</template>