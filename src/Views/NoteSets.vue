<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { mdiClose, mdiDownload, mdiFileDocumentOutline, mdiFolderMove, mdiNoteOffOutline, mdiPencil, mdiPlus, mdiUpload } from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openNativeDialog } from '@tauri-apps/plugin-dialog';
import { info } from '@tauri-apps/plugin-log';

import NewFileDialog from '../Controls/NewFileDialog.vue';
import WorkspaceSwitcher from '../Controls/WorkspaceSwitcher.vue';
import {
  loadEditorComponent,
  storePendingEditorBody,
  type EditorBodyResult,
  type EditorNoteRef,
} from '../utils/editorRoute'
import { getErrorMessage } from '../utils/getErrorMessage'
import { invokeCommand } from '../utils/invoke'
import { exportLocalNoteMdrf, importLocalNoteMdrf, moveLocalNoteToWorkspace } from '../utils/localNoteStore'
import { fetchNoteSetEntry, invalidateNoteSetEntries, loadNoteSetEntries, type NoteSetEntry } from '../utils/noteSetStore'
import { isDebugLoadingEnabled, noteLoadControllerKey, startEditorTransitionKey } from '../utils/routeTransition'
import {
  addWorkspaceDirectory,
  externalNotes,
  forgetExternalNote,
  loadWorkspaceState,
  rememberExternalNote,
  workspaceDirectories,
} from '../utils/workspaceStore'

const startEditorTransition = inject(startEditorTransitionKey)!
const noteLoadController = inject(noteLoadControllerKey)!
let editorPreload: Promise<unknown> | undefined

const DEFAULT_SECTION_ID = 'default'
const EXTERNAL_SECTION_ID = 'external'
const MDRF_EXTENSION_PATTERN = /\.mdrf$/i
const PATH_SEPARATORS = /[\\/]/

interface WorkspaceSection {
  id: string
  name: string
  kind: 'workspace' | 'external'
  dir?: string
}

function preloadEditor() {
  if (editorPreload) return editorPreload
  // 预加载失败不影响点击时由路由重新加载
  editorPreload = loadEditorComponent().catch(() => undefined)
  return editorPreload
}

const noteRefOf = (noteSet: NoteSetItem): EditorNoteRef => ({
  fileName: noteSet.fileName,
  dir: noteSet.dir,
  filePath: noteSet.filePath,
})

async function prepareEditor(note: EditorNoteRef) {
  noteLoadController.setName(note.fileName)
  let unlisten: (() => void) | undefined
  if (isTauri()) {
    unlisten = await listen<number>('file-load-progress', (event) => {
      noteLoadController.setProgress(event.payload)
    })
  }
  const bodyPromise: Promise<EditorBodyResult> = invokeCommand<{ content: string }>('get_mdr_file_body', {
    ...note,
    debugProgress: isDebugLoadingEnabled.value,
  }).then(
    (body) => ({ content: body.content ?? '' }),
    (error: unknown) => ({ error }),
  )
  storePendingEditorBody(note, bodyPromise)
  try {
    await Promise.all([preloadEditor(), bodyPromise])
  } finally {
    unlisten?.()
  }
}

async function openEditor(noteSet: NoteSetItem) {
  noteSet.loading = true
  const note = noteRefOf(noteSet)
  const query = {
    ...(note.dir ? { dir: note.dir } : {}),
    ...(note.filePath ? { path: note.filePath } : {}),
  }
  try {
    await startEditorTransition(
      { name: 'editor', params: { fileName: note.fileName }, query },
      () => prepareEditor(note),
    )
  } finally {
    noteSet.loading = false
  }
}

const isCreateDialogOpen = ref(false)

// 桌面版的 .mdrf 已是真实文件，导出与上传都只对浏览器预览有意义
const isWebEnv = !isTauri()
const exportingFileName = ref('')
const hint = ref('')
const isHintOpen = ref(false)

function showHint(message: string) {
  hint.value = message
  isHintOpen.value = true
}

async function exportNoteSet(noteSet: NoteSetItem) {
  exportingFileName.value = noteSet.fileName
  try {
    showHint(`已导出 ${await exportLocalNoteMdrf(noteSet.fileName)}`)
  } catch (error) {
    showHint(`导出失败：${getErrorMessage(error)}`)
  } finally {
    exportingFileName.value = ''
  }
}

const activeSectionId = ref(DEFAULT_SECTION_ID)
const sections = computed<WorkspaceSection[]>(() => [
  { id: DEFAULT_SECTION_ID, name: '默认工作区', kind: 'workspace' },
  ...workspaceDirectories.value.map((item) => ({
    id: item.id,
    name: item.name,
    kind: 'workspace' as const,
    dir: item.dir,
  })),
  { id: EXTERNAL_SECTION_ID, name: '最近打开的外部文件', kind: 'external' },
])
const activeSection = computed(
  () => sections.value.find((section) => section.id === activeSectionId.value) ?? sections.value[0],
)
const activeDir = computed(() => activeSection.value.dir)
const INITIAL_VISIBLE_COUNT = 12
const VISIBLE_BATCH_SIZE = 12
const SKELETON_COUNT = 6
const SENTINEL_MARGIN_PX = 240

type NoteSetItem = NoteSetEntry & { loading: boolean; localName?: string }

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

async function loadExternalItems(): Promise<NoteSetItem[]> {
  return Promise.all(
    externalNotes.value.map(async (record) => {
      const { fileName, localName } = record
      try {
        const entry = record.path
          ? await fetchNoteSetEntry(fileName, undefined, record.path)
          : await fetchNoteSetEntry(localName ?? fileName)
        return { ...entry, localName, loading: false }
      } catch {
        // 外部文件可能已被移动或删除，仍保留记录让用户看到并自行移除
        return {
          fileName,
          localName,
          filePath: record.path,
          name: record.name,
          description: '文件已不可用',
          updatedAt: record.updatedAt,
          loading: false,
        }
      }
    }),
  )
}

async function loadActiveSection() {
  isLoading.value = true
  try {
    if (activeSection.value.kind === 'external') {
      noteSets.value = await loadExternalItems()
    } else {
      const entries = await loadNoteSetEntries(activeDir.value)
      noteSets.value = entries.map((entry) => ({ ...entry, loading: false }))
    }
    // 网页端无 IPC，日志插件的 invoke 会抛错
    if (isTauri()) info(`读取笔记元信息成功，共 ${noteSets.value.length} 条`)
  } catch {
    isError.value = true;
  } finally {
    isLoading.value = false;
  }
}

watch(activeSectionId, () => {
  visibleCount.value = INITIAL_VISIBLE_COUNT
  void loadActiveSection()
})

onMounted(async () => {
  listObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    growVisibleNoteSets();
    void fillListViewport();
  }, { rootMargin: `${SENTINEL_MARGIN_PX}px` });
  await loadWorkspaceState()
  await loadActiveSection()
});

watch(listSentinel, (sentinel) => {
  listObserver?.disconnect();
  if (sentinel) listObserver?.observe(sentinel);
});

onBeforeUnmount(() => {
  listObserver?.disconnect();
  listObserver = null;
});

const uploadInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

function triggerUpload() {
  uploadInput.value?.click()
}

async function onUploadSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  isImporting.value = true
  try {
    const imported = await importLocalNoteMdrf(file)
    const entry = await fetchNoteSetEntry(imported)
    await rememberExternalNote({
      localName: imported,
      fileName: imported,
      name: entry.name,
      updatedAt: entry.updatedAt,
    })
    activeSectionId.value = EXTERNAL_SECTION_ID
    await loadActiveSection()
    showHint(`已导入 ${imported}`)
  } catch (error) {
    showHint(`导入失败：${getErrorMessage(error)}`)
  } finally {
    isImporting.value = false
  }
}

const fileNameOfPath = (path: string): string =>
  path.split(PATH_SEPARATORS).pop()?.replace(MDRF_EXTENSION_PATTERN, '') ?? '未命名笔记'

async function openExternalFile() {
  const selected = await openNativeDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'Mindrizzle 笔记', extensions: ['mdrf'] }],
  })
  if (typeof selected !== 'string') return
  const fileName = fileNameOfPath(selected)
  let entry: NoteSetEntry
  try {
    entry = await fetchNoteSetEntry(fileName, undefined, selected)
  } catch (error) {
    showHint(`打开失败：${getErrorMessage(error)}`)
    return
  }
  await rememberExternalNote({
    path: selected,
    fileName,
    name: entry.name,
    updatedAt: entry.updatedAt,
  })
  activeSectionId.value = EXTERNAL_SECTION_ID
  await loadActiveSection()
  await openEditor({ ...entry, loading: false })
}

async function pickWorkspaceDirectory() {
  const selected = await openNativeDialog({ directory: true, multiple: false })
  if (typeof selected !== 'string') return
  const entry = await addWorkspaceDirectory(selected)
  activeSectionId.value = entry.id
  await loadActiveSection()
  showHint(`已添加工作区 ${entry.name}`)
}

async function removeExternalNote(noteSet: NoteSetItem) {
  const key = noteSet.filePath ?? noteSet.localName
  if (!key) return
  await forgetExternalNote(key)
  await loadActiveSection()
}

const workspaceTargets = computed(() => [
  { id: 'default', name: '默认工作区', dir: undefined },
  ...workspaceDirectories.value.map((item) => ({ id: item.id, name: item.name, dir: item.dir })),
])

async function moveExternalNote(noteSet: NoteSetItem, targetDir?: string) {
  const key = noteSet.filePath ?? noteSet.localName
  if (!key) return
  try {
    // 网页端副本只能归入默认工作区；桌面端直接把归档文件挪进目标目录
    if (noteSet.localName) await moveLocalNoteToWorkspace(noteSet.localName)
    else await invokeCommand('move_mdrf_file', { filePath: noteSet.filePath, dir: targetDir })
    await forgetExternalNote(key)
    invalidateNoteSetEntries()
    await loadActiveSection()
    showHint('已移动到工作区')
  } catch (error) {
    showHint(`移动失败：${getErrorMessage(error)}`)
  }
}

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
</script>
<template>
  <v-sheet class="note-sets-page" elevation="0">
    <Teleport to="#toolbar-actions" defer>
      <WorkspaceSwitcher
        :model-value="activeSectionId"
        :options="sections"
        :can-add-workspace="!isWebEnv"
        @update:model-value="activeSectionId = $event"
        @add-workspace="pickWorkspaceDirectory"
      />
    </Teleport>
    <v-snackbar v-model="isError" timeout="2000">
      Oh no!便签怎么皱成一团了！
    </v-snackbar>
    <v-snackbar v-model="isHintOpen" timeout="2500">
      {{ hint }}
    </v-snackbar>
    <div class="note-sets-scroll pa-4">
      <template v-if="isLoading">
        <v-skeleton-loader v-for="index in SKELETON_COUNT" :key="index" type="card" class="mb-4" />
      </template>
      <v-empty-state v-else-if="noteSets.length === 0"
        :icon="activeSection.kind === 'external' ? mdiFileDocumentOutline : mdiNoteOffOutline"
        :title="activeSection.kind === 'external' ? '还没有打开过外部文件' : '还没有便签……'"
        :text="activeSection.kind === 'external' ? '点击右下角按钮打开 .mdrf 文件' : '点击右下角的按钮创建新的便签集'" />
      <v-list v-else class="overflow-visible">
        <v-card v-for="noteSet in visibleNoteSets" :key="`${noteSet.dir ?? ''}|${noteSet.filePath ?? ''}|${noteSet.fileName}`" class="mb-4">
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
            <v-btn
              v-if="isWebEnv && activeSection.kind === 'workspace'"
              @click="exportNoteSet(noteSet)"
              :icon="mdiDownload"
              :loading="exportingFileName === noteSet.fileName"
              variant="text"
            ></v-btn>
            <v-menu v-if="activeSection.kind === 'external'" location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" :icon="mdiFolderMove" variant="text" />
              </template>
              <v-list density="compact" min-width="200">
                <v-list-item
                  v-for="target in workspaceTargets"
                  :key="target.id"
                  @click="moveExternalNote(noteSet, target.dir)"
                >
                  <v-list-item-title>{{ target.name }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
            <v-btn
              v-if="activeSection.kind === 'external'"
              @click="removeExternalNote(noteSet)"
              :icon="mdiClose"
              variant="text"
            ></v-btn>
          </v-card-actions>
        </v-card>
        <div ref="listSentinel" />
      </v-list>
    </div>
    <input ref="uploadInput" type="file" accept=".mdrf" class="d-none" @change="onUploadSelected" />
    <div class="speed-dial-anchor">
      <v-speed-dial location="top center" transition="fade-transition">
        <template #activator="{ props: activatorProps }">
          <v-fab v-bind="activatorProps" :icon="mdiPlus" :loading="isImporting" color="primary" />
        </template>
        <v-btn key="create" :icon="mdiPlus" @click="isCreateDialogOpen = true" />
        <v-btn v-if="isWebEnv" key="upload" :icon="mdiUpload" @click="triggerUpload" />
        <v-btn v-else key="open" :icon="mdiFileDocumentOutline" @click="openExternalFile" />
      </v-speed-dial>
    </div>
    <NewFileDialog
      :is-open="isCreateDialogOpen"
      :dir="activeSection.kind === 'workspace' ? activeDir : undefined"
      @update:close="isCreateDialogOpen = $event.status"
    />
  </v-sheet>
</template>

<style scoped>
.note-sets-page {
  height: 100%;
}

/* VFab 的 app 定位在 speed dial 的 activator 插槽里拿不到 VApp 布局上下文，所以自己固定在右下角 */
.speed-dial-anchor {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1005;
}

/* 滚动交给列表自身：页面容器留在原位，FAB 与路由内容不随滚动移位 */
.note-sets-scroll {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  /* 跟随 Vuetify 主题：深色下是白、浅色下是黑 */
  scrollbar-color: rgba(var(--v-border-color), 0.3) transparent;
}

.note-sets-scroll::-webkit-scrollbar {
  width: 8px;
}

.note-sets-scroll::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: rgba(var(--v-border-color), 0.3);
}

.note-sets-scroll::-webkit-scrollbar-track {
  background: transparent;
}
</style>