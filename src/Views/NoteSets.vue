<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  mdiCheckboxBlankOutline,
  mdiCheckboxMarked,
  mdiCheckboxMultipleOutline,
  mdiClose,
  mdiCheck,
  mdiContentCopy,
  mdiDeleteOutline,
  mdiDotsVertical,
  mdiDownload,
  mdiFilterVariant,
  mdiFileDocumentOutline,
  mdiFilePdfBox,
  mdiFolderMove,
  mdiInformationOutline,
  mdiLanguageHtml5,
  mdiMagnify,
  mdiNoteOffOutline,
  mdiPencil,
  mdiPlus,
  mdiRenameBox,
  mdiSelectAll,
  mdiSort,
  mdiStar,
  mdiStarOutline,
  mdiUpload,
} from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openNativeDialog } from '@tauri-apps/plugin-dialog';
import { info } from '@tauri-apps/plugin-log';
import { useRoute } from 'vue-router';

import ExportNoteDialog from '../Controls/ExportNoteDialog.vue';
import NewFileDialog from '../Controls/NewFileDialog.vue';
import NoteDetailDialog, { type NoteDetailTarget } from '../Controls/NoteDetailDialog.vue';
import TagLibraryMenu from '../Controls/TagLibraryMenu.vue';
import WorkspaceSwitcher from '../Controls/WorkspaceSwitcher.vue';
import type { ExportFormat } from '../utils/noteExport/types';
import {
  loadEditorComponent,
  storePendingEditorBody,
  type EditorBodyResult,
  type EditorNoteRef,
} from '../utils/editorRoute';
import { OPEN_COMMAND_PALETTE_EVENT } from '../utils/commandPaletteShortcut';
import { getErrorMessage } from '../utils/getErrorMessage';
import { loadRecentNotes, recordRecentNote } from '../utils/homeActivity';
import {
  exportLocalNoteMdrf,
  fileOperations,
  importLocalNoteMdrf,
  isValidNoteFileName,
  NOTE_FILE_NAME_MAX_LEN,
  NOTE_FILE_NAME_RULE_HINT,
  moveLocalNoteToWorkspace,
  noteFileLocationOf,
  workspaceLocationOf,
} from '../fileOperations';
import {
  fetchNoteSetEntry,
  invalidateNoteSetEntries,
  loadNoteSetEntries,
  patchNoteSetMeta,
  type NoteSetEntry,
} from '../utils/noteSetStore';
import {
  isDebugLoadingEnabled,
  noteLoadControllerKey,
  startEditorTransitionKey,
} from '../utils/routeTransition';
import {
  loadTagLibrary,
  rememberTags,
  resolveTagColor,
  sanitizeTags,
  type TagLibraryChange,
} from '../utils/tagStore';
import { useToolbarSelection } from '../utils/toolbarSelection';
import {
  addWorkspaceDirectory,
  externalNotes,
  forgetExternalNote,
  loadWorkspaceState,
  moveWorkspaceDirectory,
  rememberExternalNote,
  removeWorkspaceDirectory,
  renameWorkspaceDirectory,
  workspaceDirectories,
} from '../utils/workspaceStore';
import { isPinnedNote, loadPinnedNotes, pinKeyOf, togglePinnedNote } from '../utils/homePinned';
import { useTourKit, TourKitLayer } from '../utils/tour-kit';
import { createNoteSetsTourSteps } from '../utils/tour-kit/tours/noteSetsTour';
import { mdiCompassOutline } from '@mdi/js';
import { getSetting, setSetting } from '../utils/settingsStore.ts';

const startEditorTransition = inject(startEditorTransitionKey)!;
const noteLoadController = inject(noteLoadControllerKey)!;
const route = useRoute();
let editorPreload: Promise<unknown> | undefined;

const DEFAULT_SECTION_ID = 'default';
const EXTERNAL_SECTION_ID = 'external';
const MDRF_EXTENSION_PATTERN = /\.mdrf$/i;
const PATH_SEPARATORS = /[\\/]/;

interface WorkspaceSection {
  id: string;
  name: string;
  kind: 'workspace' | 'external';
  dir?: string;
  isEditable?: boolean;
}

function preloadEditor() {
  if (editorPreload) return editorPreload;
  editorPreload = loadEditorComponent().catch(() => undefined);
  return editorPreload;
}

const noteRefOf = (noteSet: NoteSetItem): EditorNoteRef => ({
  fileName: noteSet.fileName,
  dir: noteSet.dir,
  filePath: noteSet.filePath,
});

async function prepareEditor(note: EditorNoteRef) {
  noteLoadController.setName(note.fileName);
  let unlisten: (() => void) | undefined;
  if (isTauri()) {
    unlisten = await listen<number>('file-load-progress', (event) => {
      noteLoadController.setProgress(event.payload);
    });
  }
  const bodyPromise: Promise<EditorBodyResult> = fileOperations
    .getNoteBody(noteFileLocationOf(note), isDebugLoadingEnabled.value)
    .then(
      (body) => ({ content: body.content ?? '' }),
      (error: unknown) => ({ error }),
    );
  storePendingEditorBody(note, bodyPromise);
  try {
    await Promise.all([preloadEditor(), bodyPromise]);
  } finally {
    unlisten?.();
  }
}

async function openEditor(noteSet: NoteSetItem) {
  if (noteSet.loading) return;
  noteSet.loading = true;
  const note = noteRefOf(noteSet);
  const query = {
    ...(note.dir ? { dir: note.dir } : {}),
    ...(note.filePath ? { path: note.filePath } : {}),
  };
  try {
    const didNavigate = await startEditorTransition(
      { name: 'editor', params: { fileName: note.fileName }, query },
      () => prepareEditor(note),
    );
    if (didNavigate) recordRecentNote(note);
  } finally {
    noteSet.loading = false;
  }
}

const isCreateDialogOpen = ref(false);

// 桌面版的 .mdrf 已是真实文件，导出与上传都只对浏览器预览有意义
const isWebEnv = !isTauri();
const exportingFileName = ref('');
const hint = ref('');
const isHintOpen = ref(false);

function showHint(message: string) {
  hint.value = message;
  isHintOpen.value = true;
}

async function exportNoteSet(noteSet: NoteSetItem) {
  exportingFileName.value = noteSet.fileName;
  try {
    showHint(`已导出 ${await exportLocalNoteMdrf(noteSet.fileName)}`);
  } catch (error) {
    showHint(`导出失败：${getErrorMessage(error)}`);
  } finally {
    exportingFileName.value = '';
  }
}

const isExportOpen = ref(false);
const exportMode = ref<ExportFormat>('html');
const exportNote = ref<EditorNoteRef | null>(null);
const exportTitle = ref('');

function openExport(noteSet: NoteSetItem, mode: ExportFormat) {
  exportNote.value = noteRefOf(noteSet);
  exportTitle.value = noteSet.name;
  exportMode.value = mode;
  isExportOpen.value = true;
}

// ---------- 工作区 / sections ----------
const activeSectionId = ref(DEFAULT_SECTION_ID);
const sections = computed<WorkspaceSection[]>(() => [
  { id: DEFAULT_SECTION_ID, name: '默认工作区', kind: 'workspace' },
  ...workspaceDirectories.value.map((item) => ({
    id: item.id,
    name: item.name,
    kind: 'workspace' as const,
    dir: item.dir,
    isEditable: true,
  })),
  { id: EXTERNAL_SECTION_ID, name: '最近打开的外部文件', kind: 'external' },
]);
const activeSection = computed(
  () => sections.value.find((section) => section.id === activeSectionId.value) ?? sections.value[0],
);
const activeDir = computed(() => activeSection.value.dir);
const isExternalSection = computed(() => activeSection.value.kind === 'external');

const INITIAL_VISIBLE_COUNT = 12;
const VISIBLE_BATCH_SIZE = 12;
const SKELETON_COUNT = 6;
const SENTINEL_MARGIN_PX = 240;
const SORT_OPTIONS = [
  { value: 'pinned-first', label: '置顶优先' },
  { value: 'updated-desc', label: '最近编辑' },
  { value: 'updated-asc', label: '最早编辑' },
  { value: 'name-asc', label: '名称 A-Z' },
  { value: 'name-desc', label: '名称 Z-A' },
] as const;
const UPDATED_WITHIN_OPTIONS = [
  { value: 'all', label: '不限时间' },
  { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' },
  { value: '90', label: '最近 90 天' },
] as const;
const MILLISECONDS_PER_DAY = 86_400_000;

type NoteSetItem = NoteSetEntry & { loading: boolean; localName?: string };
type NoteSetSort = (typeof SORT_OPTIONS)[number]['value'];
type TagMatchMode = 'all' | 'any';
type UpdatedWithin = (typeof UPDATED_WITHIN_OPTIONS)[number]['value'];

interface NoteSetFilters {
  tags: string[];
  includeUntagged: boolean;
  tagMatchMode: TagMatchMode;
  updatedWithin: UpdatedWithin;
}

const isError = ref(false);
const isLoading = ref(true);
const isSectionLoading = ref(false);
const noteSets = ref<NoteSetItem[]>([]);
const visibleCount = ref(INITIAL_VISIBLE_COUNT);
const sortBy = ref<NoteSetSort>('pinned-first');
const selectedTags = ref<string[]>([]);
const includeUntagged = ref(false);
const tagMatchMode = ref<TagMatchMode>('all');
const updatedWithin = ref<UpdatedWithin>('all');
const isFilterDialogOpen = ref(false);
const filterTagSearch = ref('');
const draftSelectedTags = ref<string[]>([]);
const draftIncludeUntagged = ref(false);
const draftTagMatchMode = ref<TagMatchMode>('all');
const draftUpdatedWithin = ref<UpdatedWithin>('all');
const listSentinel = ref<HTMLElement | null>(null);
let sectionLoadId = 0;
let hasLoadedSection = false;

// ---------- 工具栏折叠 ----------
const COLLAPSE_BUFFER = 10;
// teleport 尚未渲染时的兜底按钮宽度（Vuetify icon comfortable 约 40px）
const FALLBACK_BUTTON_WIDTH = 40;

const isCompactToolbar = ref(false);
let titleResizeObserver: ResizeObserver | null = null;
let titleMutationObserver: MutationObserver | null = null;
let layoutRaf = 0;
let tourAutoStartTimer: number | undefined;

function findTitleEl(): HTMLElement | null {
  const wrap = document.querySelector<HTMLElement>('.app-title-wrap');
  if (!wrap) return null;
  const titles = wrap.querySelectorAll<HTMLElement>('.app-title');
  return titles[titles.length - 1] ?? null;
}

function findRightActionsEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#title-right-actions');
}

// 折叠后标题变宽，文字放得下时 scrollWidth 会被 clamp 到 clientWidth，
// 读不到真实文本宽度导致永远恢复不了；临时撑成 max-content 再同步读回
function measureNaturalWidth(titleEl: HTMLElement): number {
  const prevWidth = titleEl.style.width;
  titleEl.style.width = 'max-content';
  const natural = titleEl.scrollWidth;
  titleEl.style.width = prevWidth;
  return natural;
}

function evaluateCompact() {
  const titleEl = findTitleEl();
  if (!titleEl) return;
  const available = titleEl.clientWidth;
  const natural = measureNaturalWidth(titleEl);

  if (!isCompactToolbar.value) {
    // 展开态：标题装不下才折叠
    if (natural > available + COLLAPSE_BUFFER) {
      isCompactToolbar.value = true;
    }
    return;
  }

  const rightEl = findRightActionsEl();
  const measured = rightEl?.getBoundingClientRect().width ?? 0;
  const singleButtonWidth = measured > 0 ? measured : FALLBACK_BUTTON_WIDTH;
  const delta = singleButtonWidth * 2;
  const availableIfExpanded = available - delta;

  // 展开后仍能完整放下标题才恢复
  if (natural <= availableIfExpanded - COLLAPSE_BUFFER) {
    isCompactToolbar.value = false;
  }
}

function scheduleEvaluate() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(evaluateCompact);
}

function setupTitleObserver() {
  const wrap = document.querySelector<HTMLElement>('.app-title-wrap');
  if (!wrap) {
    requestAnimationFrame(setupTitleObserver);
    return;
  }
  titleResizeObserver = new ResizeObserver(scheduleEvaluate);
  titleResizeObserver.observe(wrap);
  titleMutationObserver = new MutationObserver(scheduleEvaluate);
  titleMutationObserver.observe(wrap, { childList: true, subtree: true, characterData: true });
  scheduleEvaluate();
}

const recentOpenedAt = ref<Map<string, number>>(new Map());
function loadRecentTimes() {
  recentOpenedAt.value = new Map(loadRecentNotes().map((r) => [pinKeyOf(r), r.openedAt]));
}
function lastOpenedAt(item: NoteSetItem): number | undefined {
  return recentOpenedAt.value.get(pinKeyOf(item));
}

// 便签集主键与首页置顶主键格式一致（dir|filePath|fileName），彼此可直接互查
const noteSetKeyOf = (item: NoteSetItem): string => pinKeyOf(item);

const availableTags = computed(() =>
  [...new Set(noteSets.value.flatMap((noteSet) => noteSet.tag))].sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  ),
);
const tagNoteCounts = computed(
  () =>
    new Map(
      availableTags.value.map((tag) => [
        tag,
        noteSets.value.filter((noteSet) => noteSet.tag.includes(tag)).length,
      ]),
    ),
);
const activeFilterCount = computed(
  () =>
    Number(selectedTags.value.length > 0) +
    Number(includeUntagged.value) +
    Number(updatedWithin.value !== 'all'),
);
const sortLabel = computed(
  () => SORT_OPTIONS.find((option) => option.value === sortBy.value)!.label,
);

const appliedFilters = computed<NoteSetFilters>(() => ({
  tags: selectedTags.value,
  includeUntagged: includeUntagged.value,
  tagMatchMode: tagMatchMode.value,
  updatedWithin: updatedWithin.value,
}));

function matchesFilters(noteSet: NoteSetItem, filters: NoteSetFilters): boolean {
  const { tags, includeUntagged: includeNoTags, tagMatchMode, updatedWithin } = filters;
  const matchesTag =
    tags.length === 0
      ? !includeNoTags || noteSet.tag.length === 0
      : (tagMatchMode === 'all'
          ? tags.every((tag) => noteSet.tag.includes(tag))
          : tags.some((tag) => noteSet.tag.includes(tag))) ||
        (includeNoTags && noteSet.tag.length === 0);
  if (!matchesTag) return false;
  if (updatedWithin === 'all') return true;
  const cutoff = Date.now() - Number(updatedWithin) * MILLISECONDS_PER_DAY;
  return noteSet.updatedAt >= cutoff;
}

function sortNoteSets(items: NoteSetItem[]): NoteSetItem[] {
  return [...items].sort((left, right) => {
    if (sortBy.value === 'pinned-first') {
      const leftPinned = isPinnedNote(left);
      const rightPinned = isPinnedNote(right);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, 'zh-CN');
    }
    if (sortBy.value === 'name-asc' || sortBy.value === 'name-desc') {
      const direction = sortBy.value === 'name-asc' ? 1 : -1;
      return direction * left.name.localeCompare(right.name, 'zh-CN');
    }
    const direction = sortBy.value === 'updated-desc' ? -1 : 1;
    return (
      direction * (left.updatedAt - right.updatedAt) || left.name.localeCompare(right.name, 'zh-CN')
    );
  });
}

const filteredNoteSets = computed(() => {
  const matchingItems = noteSets.value.filter((noteSet) =>
    matchesFilters(noteSet, appliedFilters.value),
  );
  return sortNoteSets(matchingItems);
});
const visibleFilterTags = computed(() => {
  const keyword = filterTagSearch.value.trim().toLocaleLowerCase();
  return keyword
    ? availableTags.value.filter((tag) => tag.toLocaleLowerCase().includes(keyword))
    : availableTags.value;
});
const draftFilterCount = computed(
  () =>
    noteSets.value.filter((noteSet) =>
      matchesFilters(noteSet, {
        tags: draftSelectedTags.value,
        includeUntagged: draftIncludeUntagged.value,
        tagMatchMode: draftTagMatchMode.value,
        updatedWithin: draftUpdatedWithin.value,
      }),
    ).length,
);
const visibleNoteSets = computed(() => filteredNoteSets.value.slice(0, visibleCount.value));

function growVisibleNoteSets() {
  visibleCount.value += VISIBLE_BATCH_SIZE;
}

let listObserver: IntersectionObserver | null = null;

async function fillListViewport(): Promise<void> {
  const sentinel = listSentinel.value;
  if (!sentinel || visibleCount.value >= filteredNoteSets.value.length) return;
  await nextTick();
  if (sentinel.getBoundingClientRect().top > window.innerHeight + SENTINEL_MARGIN_PX) return;
  growVisibleNoteSets();
  await fillListViewport();
}

function toggleDraftTag(tag: string) {
  draftSelectedTags.value = draftSelectedTags.value.includes(tag)
    ? draftSelectedTags.value.filter((selectedTag) => selectedTag !== tag)
    : [...draftSelectedTags.value, tag];
}

function toggleVisibleDraftTags() {
  const visibleTags = visibleFilterTags.value;
  const areAllVisibleSelected = visibleTags.every((tag) => draftSelectedTags.value.includes(tag));
  draftSelectedTags.value = areAllVisibleSelected
    ? draftSelectedTags.value.filter((tag) => !visibleTags.includes(tag))
    : [...new Set([...draftSelectedTags.value, ...visibleTags])];
}

function openFilterDialog() {
  draftSelectedTags.value = [...selectedTags.value];
  draftIncludeUntagged.value = includeUntagged.value;
  draftTagMatchMode.value = tagMatchMode.value;
  draftUpdatedWithin.value = updatedWithin.value;
  filterTagSearch.value = '';
  isFilterDialogOpen.value = true;
}

function applyFilters() {
  selectedTags.value = [...draftSelectedTags.value];
  includeUntagged.value = draftIncludeUntagged.value;
  tagMatchMode.value = draftTagMatchMode.value;
  updatedWithin.value = draftUpdatedWithin.value;
  isFilterDialogOpen.value = false;
}

function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

function clearTagFilters() {
  selectedTags.value = [];
  includeUntagged.value = false;
  tagMatchMode.value = 'all';
  updatedWithin.value = 'all';
}

function clearAllFilters() {
  clearTagFilters();
  draftSelectedTags.value = [];
  draftIncludeUntagged.value = false;
  draftTagMatchMode.value = 'all';
  draftUpdatedWithin.value = 'all';
  isFilterDialogOpen.value = false;
}

watch([selectedTags, includeUntagged, tagMatchMode, updatedWithin], async () => {
  visibleCount.value = INITIAL_VISIBLE_COUNT;
  await nextTick();
  void fillListViewport();
});

watch(sortBy, async () => {
  visibleCount.value = INITIAL_VISIBLE_COUNT;
  await nextTick();
  void fillListViewport();
});

// ---------- 数据加载 ----------
async function loadExternalItems(): Promise<NoteSetItem[]> {
  const items = await Promise.all(
    externalNotes.value.map(async (record) => {
      const { fileName, localName } = record;
      let entry: NoteSetEntry;
      try {
        entry = record.path
          ? await fetchNoteSetEntry(fileName, undefined, record.path)
          : await fetchNoteSetEntry(localName ?? fileName);
      } catch {
        // 外部文件可能已被移动或删除，仍保留记录让用户看到并自行移除
        return {
          fileName,
          localName,
          filePath: record.path,
          name: record.name,
          description: '文件已不可用',
          tag: [],
          updatedAt: record.updatedAt,
          loading: false,
        };
      }
      return { ...entry, localName, loading: false };
    }),
  );
  for (const item of items) await rememberTags(item.tag);
  return items;
}

async function loadActiveSection() {
  const loadId = ++sectionLoadId;
  const section = activeSection.value;
  if (!hasLoadedSection) isLoading.value = true;
  else isSectionLoading.value = true;
  try {
    const items =
      section.kind === 'external'
        ? await loadExternalItems()
        : (await loadNoteSetEntries(section.dir)).map((entry) => ({
            ...entry,
            loading: false,
          }));
    if (loadId !== sectionLoadId) return;
    noteSets.value = items;
    loadRecentTimes();
    // 网页端无 IPC，日志插件的 invoke 会抛错
    if (isTauri()) info(`读取笔记元信息成功，共 ${noteSets.value.length} 条`);
  } catch {
    if (loadId === sectionLoadId) isError.value = true;
  } finally {
    if (loadId === sectionLoadId) {
      isLoading.value = false;
      isSectionLoading.value = false;
      hasLoadedSection = true;
    }
  }
}

// 切换工作区：显式函数取代原 watch(activeSectionId)，避免首次挂载时重复加载或误清 query 带过来的筛选
async function selectSection(id: string) {
  if (id === activeSectionId.value) return;
  activeSectionId.value = id;
  visibleCount.value = INITIAL_VISIBLE_COUNT;
  clearTagFilters();
  exitSelectMode();
  await loadActiveSection();
}

// ---------- Query 入口 ----------
// 首页标签云 / 工作区卡片 / 统计卡会带 query 跳过来：workspace 映射到 section，tags/tag 映射到筛选，sort 映射到排序
function applyQueryFromRoute() {
  const q = route.query;
  const nextTags: string[] = [];
  if (typeof q.tag === 'string' && q.tag.trim()) nextTags.push(q.tag.trim());
  if (typeof q.tags === 'string' && q.tags) {
    for (const part of q.tags.split(',')) {
      if (part.trim()) nextTags.push(part.trim());
    }
  }
  if (nextTags.length) selectedTags.value = sanitizeTags(nextTags);
  if (typeof q.sort === 'string' && SORT_OPTIONS.some((option) => option.value === q.sort)) {
    sortBy.value = q.sort as NoteSetSort;
  }
  if (typeof q.workspace === 'string' && q.workspace) {
    const matched = sections.value.find(
      (section) => section.id === q.workspace || section.dir === q.workspace,
    );
    if (matched) activeSectionId.value = matched.id;
  }
}

onMounted(async () => {
  listObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      growVisibleNoteSets();
      void fillListViewport();
    },
    { rootMargin: `${SENTINEL_MARGIN_PX}px` },
  );
  await loadWorkspaceState();
  await loadTagLibrary();
  await loadPinnedNotes();
  applyQueryFromRoute();
  await loadActiveSection();
  await nextTick();
  setupTitleObserver();
  // 完成与跳过都算“看过引导”，否则每次进入便签集都会被重新弹一遍
  tour.onComplete(markTourDone);
  tour.onExit(markTourDone);
  if (await getSetting<boolean>('tour-notesets-done')) return;
  tourAutoStartTimer = window.setTimeout(() => tour.start(), 800);
});

watch(listSentinel, (sentinel) => {
  listObserver?.disconnect();
  if (sentinel) listObserver?.observe(sentinel);
});

onBeforeUnmount(() => {
  if (tourAutoStartTimer !== undefined) window.clearTimeout(tourAutoStartTimer);
  listObserver?.disconnect();
  listObserver = null;
  titleResizeObserver?.disconnect();
  titleResizeObserver = null;
  titleMutationObserver?.disconnect();
  titleMutationObserver = null;
  cancelAnimationFrame(layoutRaf);
  toolbarSelection.clearSelection();
});

// ---------- 导入 / 打开外部文件 ----------
const uploadInput = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

function triggerUpload() {
  uploadInput.value?.click();
}

async function onUploadSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  isImporting.value = true;
  try {
    const imported = await importLocalNoteMdrf(file);
    const entry = await fetchNoteSetEntry(imported);
    await rememberExternalNote({
      localName: imported,
      fileName: imported,
      name: entry.name,
      updatedAt: entry.updatedAt,
    });
    await selectSection(EXTERNAL_SECTION_ID);
    showHint(`已导入 ${imported}`);
  } catch (error) {
    showHint(`导入失败：${getErrorMessage(error)}`);
  } finally {
    isImporting.value = false;
  }
}

const fileNameOfPath = (path: string): string =>
  path.split(PATH_SEPARATORS).pop()?.replace(MDRF_EXTENSION_PATTERN, '') ?? '未命名笔记';

async function openExternalFile() {
  const selected = await openNativeDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'Mindrizzle 笔记', extensions: ['mdrf'] }],
  });
  if (typeof selected !== 'string') return;
  const fileName = fileNameOfPath(selected);
  let entry: NoteSetEntry;
  try {
    entry = await fetchNoteSetEntry(fileName, undefined, selected);
  } catch (error) {
    showHint(`打开失败：${getErrorMessage(error)}`);
    return;
  }
  await rememberExternalNote({
    path: selected,
    fileName,
    name: entry.name,
    updatedAt: entry.updatedAt,
  });
  await selectSection(EXTERNAL_SECTION_ID);
  await openEditor({ ...entry, loading: false });
}

async function pickWorkspaceDirectory() {
  const selected = await openNativeDialog({ directory: true, multiple: false });
  if (typeof selected !== 'string') return;
  const entry = await addWorkspaceDirectory(selected);
  await selectSection(entry.id);
  showHint(`已添加工作区 ${entry.name}`);
}

async function removeExternalNote(noteSet: NoteSetItem) {
  const key = noteSet.filePath ?? noteSet.localName;
  if (!key) return;
  await forgetExternalNote(key);
  await loadActiveSection();
}

// ---------- 选中 / 批量 ----------
const COPY_NAME_SUFFIX = '_副本';
const COPY_NAME_MAX_ATTEMPTS = 100;
const FILE_NAME_IN_PATH = /[^\\/]*$/;

const isSelectMode = ref(false);
const selectedKeys = ref<string[]>([]);
const selectedCount = computed(() => selectedKeys.value.length);
const tour = useTourKit({
  steps: createNoteSetsTourSteps({
    activeSectionId,
    isSelectMode,
    exitSelectMode,
  }),
});

const markTourDone = () => {
  setSetting('tour-notesets-done', true).catch((error) => {
    console.warn('记录引导完成状态失败', error);
  });
};

const toolbarSelection = useToolbarSelection();

watch(
  [isSelectMode, selectedCount],
  ([isSelecting, count]) => {
    if (isSelecting) toolbarSelection.setSelection(count, exitSelectMode);
    else toolbarSelection.clearSelection();
  },
  { immediate: true },
);

onBeforeUnmount(() => toolbarSelection.clearSelection());

const selectedItems = computed(() =>
  noteSets.value.filter((item) => selectedKeys.value.includes(noteSetKeyOf(item))),
);

const noteSetArgsOf = (item: NoteSetItem) => ({
  ...noteFileLocationOf(item),
});

const renamePathFileName = (path: string, name: string): string =>
  path.replace(FILE_NAME_IN_PATH, `${name}.mdrf`);

function isSelected(item: NoteSetItem): boolean {
  return selectedKeys.value.includes(noteSetKeyOf(item));
}

function toggleSelect(item: NoteSetItem) {
  const key = noteSetKeyOf(item);
  selectedKeys.value = isSelected(item)
    ? selectedKeys.value.filter((itemKey) => itemKey !== key)
    : [...selectedKeys.value, key];
}

function enterSelectMode() {
  isSelectMode.value = true;
}

function exitSelectMode() {
  isSelectMode.value = false;
  selectedKeys.value = [];
}

function toggleSelectAll() {
  selectedKeys.value =
    selectedKeys.value.length === noteSets.value.length ? [] : noteSets.value.map(noteSetKeyOf);
}

// 非多选时整卡点击打开编辑器；操作按钮所在的 card-actions 已统一 @click.stop 拦截
function onCardClick(item: NoteSetItem) {
  if (isSelectMode.value) {
    toggleSelect(item);
    return;
  }
  void openEditor(item);
}

// ---------- 置顶 ----------
async function togglePin(item: NoteSetItem) {
  await togglePinnedNote(item);
}

interface BatchOutcome {
  succeeded: number;
  failed: number;
  firstError: string;
}

async function runOnItems(
  items: NoteSetItem[],
  action: (item: NoteSetItem) => Promise<void>,
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { succeeded: 0, failed: 0, firstError: '' };
  for (const item of items) {
    try {
      await action(item);
      outcome.succeeded += 1;
    } catch (error) {
      outcome.failed += 1;
      outcome.firstError ||= getErrorMessage(error);
    }
  }
  return outcome;
}

function reportBatch(label: string, outcome: BatchOutcome) {
  showHint(
    outcome.failed
      ? `${label}成功 ${outcome.succeeded} 份，失败 ${outcome.failed} 份：${outcome.firstError}`
      : `${label}成功 ${outcome.succeeded} 份`,
  );
}

async function isNameAvailable(item: NoteSetItem, name: string): Promise<boolean> {
  if (!item.filePath) {
    return fileOperations.isFileNameAvailable(name, workspaceLocationOf(item.dir));
  }
  try {
    await fileOperations.getNoteMeta(
      noteFileLocationOf({
        fileName: name,
        filePath: renamePathFileName(item.filePath, name),
      }),
    );
    return false;
  } catch {
    return true;
  }
}

async function allocateCopyName(item: NoteSetItem): Promise<string> {
  const base = `${item.fileName}${COPY_NAME_SUFFIX}`.slice(0, NOTE_FILE_NAME_MAX_LEN);
  for (let attempt = 1; attempt <= COPY_NAME_MAX_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? '' : String(attempt);
    const candidate = `${base.slice(0, NOTE_FILE_NAME_MAX_LEN - suffix.length)}${suffix}`;
    if (await isNameAvailable(item, candidate)) return candidate;
  }
  throw new Error('同名副本过多');
}

const externalRecordOf = (item: NoteSetItem, fileName: string) => ({
  ...(item.filePath ? { path: renamePathFileName(item.filePath, fileName) } : {}),
  ...(item.localName ? { localName: fileName } : {}),
  fileName,
  name: fileName,
  updatedAt: Date.now(),
});

async function copyNoteSet(item: NoteSetItem): Promise<void> {
  const newName = await allocateCopyName(item);
  const copied = await fileOperations.copyNote({
    location: noteSetArgsOf(item),
    newFileName: newName,
  });
  invalidateNoteSetEntries();
  if (isExternalSection.value) {
    await rememberExternalNote(externalRecordOf(item, copied));
    return;
  }
  const entry = await fetchNoteSetEntry(copied, item.dir);
  noteSets.value = [{ ...entry, loading: false }, ...noteSets.value];
}

async function copyFromCard(item: NoteSetItem) {
  try {
    await copyNoteSet(item);
    if (isExternalSection.value) await loadActiveSection();
    showHint('已创建副本');
  } catch (error) {
    showHint(`复制失败：${getErrorMessage(error)}`);
  }
}

async function copySelected() {
  const items = [...selectedItems.value];
  exitSelectMode();
  const outcome = await runOnItems(items, copyNoteSet);
  if (isExternalSection.value && outcome.succeeded) await loadActiveSection();
  reportBatch('复制', outcome);
}

async function deleteNoteSet(item: NoteSetItem): Promise<void> {
  await fileOperations.deleteNote(noteSetArgsOf(item));
  invalidateNoteSetEntries();
  if (isExternalSection.value) {
    const key = item.filePath ?? item.localName;
    if (key) await forgetExternalNote(key);
    return;
  }
  noteSets.value = noteSets.value.filter((entry) => entry !== item);
}

const deleteTargets = ref<NoteSetItem[]>([]);
const isDeleteOpen = ref(false);

function askDelete(items: NoteSetItem[]) {
  deleteTargets.value = [...items];
  isDeleteOpen.value = true;
}

function askDeleteSelected() {
  askDelete(selectedItems.value);
}

async function confirmDelete() {
  const items = deleteTargets.value;
  isDeleteOpen.value = false;
  exitSelectMode();
  const outcome = await runOnItems(items, deleteNoteSet);
  if (isExternalSection.value && outcome.succeeded) await loadActiveSection();
  reportBatch('删除', outcome);
  deleteTargets.value = [];
}

// ---------- 重命名 ----------
const isRenameNoteOpen = ref(false);
const renameNoteTarget = ref<NoteSetItem | null>(null);
const renameNoteDraft = ref('');
const renameNoteError = ref('');

function openRenameNote(item: NoteSetItem) {
  renameNoteTarget.value = item;
  renameNoteDraft.value = item.fileName;
  renameNoteError.value = '';
  isRenameNoteOpen.value = true;
}

async function submitRenameNote() {
  const item = renameNoteTarget.value;
  if (!item) return;
  const name = renameNoteDraft.value.trim();
  if (!isValidNoteFileName(name)) {
    renameNoteError.value = NOTE_FILE_NAME_RULE_HINT;
    return;
  }
  if (name === item.fileName) {
    isRenameNoteOpen.value = false;
    return;
  }
  try {
    await renameNoteSet(item, name);
    isRenameNoteOpen.value = false;
    showHint('已重命名');
  } catch (error) {
    renameNoteError.value = getErrorMessage(error);
  }
}

async function renameNoteSet(item: NoteSetItem, newName: string): Promise<void> {
  const isTitleFollowing = item.name === item.fileName;
  const renamed = await fileOperations.renameNote({
    location: noteSetArgsOf(item),
    newFileName: newName,
    meta: isTitleFollowing
      ? {
          title: newName,
          description: item.description,
          tag: item.tag,
        }
      : undefined,
  });
  invalidateNoteSetEntries();
  await applyRenamedNoteSet(item, renamed);
}

async function applyRenamedNoteSet(item: NoteSetItem, fileName: string) {
  if (isExternalSection.value) {
    const key = item.filePath ?? item.localName;
    if (key) await forgetExternalNote(key);
    await rememberExternalNote(externalRecordOf(item, fileName));
    await loadActiveSection();
    return;
  }
  const isTitleFollowing = item.name === item.fileName;
  item.fileName = fileName;
  item.filePath = item.filePath ? renamePathFileName(item.filePath, fileName) : undefined;
  if (isTitleFollowing) item.name = fileName;
  item.updatedAt = Date.now();
}

// ---------- 移动 ----------
const workspaceTargets = computed(() => [
  { id: 'default', name: '默认工作区', dir: undefined },
  ...workspaceDirectories.value.map((item) => ({
    id: item.id,
    name: item.name,
    dir: item.dir,
  })),
]);

const detailTarget = ref<NoteSetItem | null>(null);
const isDetailOpen = ref(false);
// 网页端只有默认工作区，跨工作区移动仅桌面端可用
const canMoveNote = computed(
  () => !isWebEnv && activeSection.value.kind === 'workspace' && workspaceTargets.value.length > 1,
);

const moveTargetsOf = (noteSet: NoteSetItem) =>
  workspaceTargets.value.filter((target) => target.dir !== noteSet.dir);

async function moveNoteToWorkspace(noteSet: NoteSetItem, targetDir?: string) {
  try {
    await fileOperations.moveNote({
      location: noteSetArgsOf(noteSet),
      workspace: workspaceLocationOf(targetDir),
    });
    invalidateNoteSetEntries();
    await loadActiveSection();
    showHint('已移动到工作区');
  } catch (error) {
    showHint(`移动失败：${getErrorMessage(error)}`);
  }
}

function openDetail(noteSet: NoteSetItem) {
  detailTarget.value = noteSet;
  isDetailOpen.value = true;
}

async function onDetailSaved(payload: { note: NoteDetailTarget }) {
  invalidateNoteSetEntries();
  const entry = noteSets.value.find((item) => item.fileName === payload.note.fileName);
  if (!entry) return;
  Object.assign(entry, {
    name: payload.note.name,
    description: payload.note.description,
    tag: payload.note.tag,
    updatedAt: Date.now(),
  });
  patchNoteSetMeta(entry);
  showHint('详情已保存');
}

function onTagLibraryChanged(change: TagLibraryChange) {
  noteSets.value.forEach((noteSet) => {
    noteSet.tag = resolveChangedTags(noteSet.tag, change);
  });
  invalidateNoteSetEntries();
}

function resolveChangedTags(tags: string[], change: TagLibraryChange): string[] {
  if (!tags.includes(change.name)) return tags;
  if (change.kind === 'remove') return tags.filter((tag) => tag !== change.name);
  return sanitizeTags(tags.map((tag) => (tag === change.name ? (change.nextName ?? tag) : tag)));
}

const isRenameDialogOpen = ref(false);
const renameTargetId = ref('');
const renameDraft = ref('');

function openRenameWorkspace(id: string) {
  renameTargetId.value = id;
  renameDraft.value = workspaceDirectories.value.find((item) => item.id === id)?.name ?? '';
  isRenameDialogOpen.value = true;
}

async function submitRenameWorkspace() {
  try {
    await renameWorkspaceDirectory(renameTargetId.value, renameDraft.value);
    isRenameDialogOpen.value = false;
    showHint('工作区已重命名');
  } catch (error) {
    showHint(`重命名失败：${getErrorMessage(error)}`);
  }
}

async function moveWorkspace(id: string, offset: number) {
  try {
    await moveWorkspaceDirectory(id, offset);
  } catch (error) {
    showHint(`移动工作区失败：${getErrorMessage(error)}`);
  }
}

async function removeWorkspace(id: string) {
  try {
    await removeWorkspaceDirectory(id);
    if (activeSectionId.value === id) await selectSection(DEFAULT_SECTION_ID);
    showHint('已移出工作区列表');
  } catch (error) {
    showHint(`移出失败：${getErrorMessage(error)}`);
  }
}

async function moveExternalNote(noteSet: NoteSetItem, targetDir?: string) {
  const key = noteSet.filePath ?? noteSet.localName;
  if (!key) return;
  try {
    if (noteSet.localName) await moveLocalNoteToWorkspace(noteSet.localName);
    else if (noteSet.filePath)
      await fileOperations.moveExternalNote({
        location: noteSetArgsOf(noteSet),
        workspace: workspaceLocationOf(targetDir),
      });
    await forgetExternalNote(key);
    invalidateNoteSetEntries();
    await loadActiveSection();
    showHint('已移动到工作区');
  } catch (error) {
    showHint(`移动失败：${getErrorMessage(error)}`);
  }
}

// ---------- 时间格式化 ----------
const MILLIS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;

const relativeTime = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

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
    <Teleport to="#title-right-actions" defer v-if="!isSelectMode">
      <template v-if="!isCompactToolbar">
        <v-btn
          color="white"
          :icon="mdiMagnify"
          title="搜索（打开命令面板）"
          variant="text"
          @click="openCommandPalette"
        />
        <v-menu location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              color="white"
              v-bind="menuProps"
              :icon="mdiSort"
              :title="`排序：${sortLabel}`"
              variant="text"
              data-tour="notes-sort"
            />
          </template>
          <v-list density="compact" min-width="160">
            <v-list-item
              v-for="option in SORT_OPTIONS"
              :key="option.value"
              :active="sortBy === option.value"
              @click="sortBy = option.value"
            >
              <v-list-item-title>{{ option.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-btn
          color="white"
          :icon="mdiFilterVariant"
          :title="activeFilterCount ? `筛选（${activeFilterCount}）` : '筛选'"
          variant="text"
          @click="openFilterDialog"
          data-tour="notes-filter"
        />
        <v-btn
          color="white"
          :icon="mdiCompassOutline"
          title="查看引导"
          variant="text"
          @click="tour.start()"
        />
      </template>
      <v-menu v-else location="bottom end" offset="4">
        <template #activator="{ props: menuProps }">
          <v-btn
            color="white"
            v-bind="menuProps"
            :icon="mdiDotsVertical"
            title="更多操作"
            variant="text"
          />
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item @click="openCommandPalette">
            <template #prepend>
              <v-icon :icon="mdiMagnify" size="small" />
            </template>
            <v-list-item-title>搜索</v-list-item-title>
          </v-list-item>
          <v-list-item @click="openFilterDialog">
            <template #prepend>
              <v-icon :icon="mdiFilterVariant" size="small" />
            </template>
            <v-list-item-title>
              筛选{{ activeFilterCount ? `（${activeFilterCount}）` : '' }}
            </v-list-item-title>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-subheader>排序</v-list-subheader>
          <v-list-item
            v-for="option in SORT_OPTIONS"
            :key="option.value"
            :active="sortBy === option.value"
            @click="sortBy = option.value"
          >
            <v-list-item-title>{{ option.label }}</v-list-item-title>
            <template v-if="sortBy === option.value" #append>
              <v-icon :icon="mdiCheck" size="small" />
            </template>
          </v-list-item>
          <v-list-item @click="tour.start()">
            <template #prepend>
              <v-icon :icon="mdiCompassOutline" size="small" />
            </template>
            <v-list-item-title>查看引导</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </Teleport>
    <Teleport to="#toolbar-actions" defer>
      <template v-if="isSelectMode">
        <v-btn
          :icon="mdiSelectAll"
          title="全选 / 取消全选"
          variant="text"
          @click="toggleSelectAll"
        />
        <v-btn
          :disabled="selectedCount === 0"
          :icon="mdiContentCopy"
          title="复制选中"
          variant="text"
          @click="copySelected"
        />
        <v-btn
          :disabled="selectedCount === 0"
          :icon="mdiDeleteOutline"
          title="删除选中"
          variant="text"
          @click="askDeleteSelected"
        />
      </template>
      <template v-else>
        <span data-tour="notes-workspace" class="d-inline-flex">
          <WorkspaceSwitcher
            :model-value="activeSectionId"
            :options="sections"
            :can-add-workspace="!isWebEnv"
            @update:model-value="selectSection"
            @add-workspace="pickWorkspaceDirectory"
            @rename-workspace="openRenameWorkspace"
            @move-workspace="moveWorkspace"
            @remove-workspace="removeWorkspace"
          />
        </span>
        <TagLibraryMenu @changed="onTagLibraryChanged" />
        <v-btn
          :icon="mdiCheckboxMultipleOutline"
          color="white"
          title="多选"
          variant="text"
          @click="enterSelectMode"
          data-tour="notes-select"
        />
      </template>
    </Teleport>
    <v-snackbar v-model="isError" timeout="2000"> Oh no!便签怎么皱成一团了！ </v-snackbar>
    <v-snackbar v-model="isHintOpen" timeout="2500">
      {{ hint }}
    </v-snackbar>
    <v-dialog v-model="isFilterDialogOpen" max-width="520" scrollable>
      <v-card>
        <v-card-title>筛选便签</v-card-title>
        <v-card-text class="note-filter-dialog__content">
          <div class="text-subtitle-2 mb-2">标签</div>
          <v-text-field
            v-model="filterTagSearch"
            :prepend-inner-icon="mdiMagnify"
            label="查找标签"
            placeholder="输入标签名称"
            density="compact"
            hide-details
            clearable
          />
          <div class="d-flex align-center justify-space-between mt-2 mb-1">
            <span class="text-body-2"> 已选 {{ draftSelectedTags.length }} 个标签 </span>
            <div class="d-flex">
              <v-btn
                :disabled="visibleFilterTags.length === 0"
                size="small"
                variant="text"
                @click="toggleVisibleDraftTags"
              >
                {{
                  visibleFilterTags.length &&
                  visibleFilterTags.every((tag) => draftSelectedTags.includes(tag))
                    ? '取消当前列表'
                    : '全选当前列表'
                }}
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                :disabled="draftSelectedTags.length === 0"
                @click="draftSelectedTags = []"
              >
                清空
              </v-btn>
            </div>
          </div>
          <div class="note-filter-dialog__tags">
            <v-list v-if="visibleFilterTags.length" density="compact">
              <v-list-item
                v-for="tag in visibleFilterTags"
                :key="tag"
                :title="tag"
                @click="toggleDraftTag(tag)"
              >
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="draftSelectedTags.includes(tag)"
                    @click.stop="toggleDraftTag(tag)"
                  />
                </template>
                <template #append>
                  <v-chip :color="resolveTagColor(tag)" size="x-small" variant="tonal">
                    {{ tagNoteCounts.get(tag) ?? 0 }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-medium-emphasis text-body-2 pa-4 text-center">
              {{ availableTags.length ? '没有匹配的标签' : '当前工作区还没有标签' }}
            </div>
          </div>
          <v-checkbox
            v-model="draftIncludeUntagged"
            class="mt-1"
            density="compact"
            hide-details
            label="包含无标签的便签"
          />
          <div class="text-subtitle-2 mt-4 mb-2">标签匹配</div>
          <v-btn-toggle
            v-model="draftTagMatchMode"
            class="note-filter-dialog__match-mode"
            color="primary"
            density="compact"
            divided
            mandatory
          >
            <v-btn value="all">匹配全部标签</v-btn>
            <v-btn value="any">匹配任一标签</v-btn>
          </v-btn-toggle>
          <div class="text-caption text-medium-emphasis mt-1">
            匹配全部时，便签必须同时包含所选标签；无标签选项会额外包含空标签便签。
          </div>
          <div class="text-subtitle-2 mt-4 mb-2">编辑时间</div>
          <v-select
            v-model="draftUpdatedWithin"
            :items="UPDATED_WITHIN_OPTIONS"
            item-title="label"
            item-value="value"
            density="compact"
            hide-details
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="note-filter-dialog__actions">
          <v-btn variant="text" @click="clearAllFilters"> 清除条件 </v-btn>
          <v-spacer />
          <span class="text-medium-emphasis text-body-2"> 匹配 {{ draftFilterCount }} 条 </span>
          <v-btn color="primary" variant="text" @click="isFilterDialogOpen = false"> 取消 </v-btn>
          <v-btn color="primary" variant="text" @click="applyFilters"> 应用 </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <div class="note-sets-scroll pa-4">
      <div v-if="isLoading" class="note-sets-grid">
        <v-skeleton-loader v-for="index in SKELETON_COUNT" :key="index" type="card" />
      </div>
      <v-empty-state
        v-else-if="noteSets.length === 0"
        :icon="activeSection.kind === 'external' ? mdiFileDocumentOutline : mdiNoteOffOutline"
        :title="activeSection.kind === 'external' ? '还没有打开过外部文件' : '还没有便签'"
        :text="
          activeSection.kind === 'external'
            ? '打开一个 .mdrf 文件后，会出现在这里'
            : '新建一份便签，开始记录你的想法'
        "
      >
        <template #actions>
          <v-btn
            v-if="activeSection.kind !== 'external'"
            :prepend-icon="mdiPlus"
            color="primary"
            @click="isCreateDialogOpen = true"
          >
            新建便签
          </v-btn>
          <v-btn
            v-else
            :prepend-icon="mdiFileDocumentOutline"
            color="primary"
            @click="isWebEnv ? triggerUpload() : openExternalFile()"
          >
            打开文件
          </v-btn>
        </template>
      </v-empty-state>
      <v-empty-state
        v-else-if="filteredNoteSets.length === 0"
        :icon="mdiFilterVariant"
        title="没有符合条件的便签"
        text="请调整右上角的标签过滤条件"
      >
        <template #actions>
          <v-btn variant="tonal" color="primary" @click="clearAllFilters"> 清除筛选条件 </v-btn>
        </template>
      </v-empty-state>
      <div v-else class="note-sets-grid" :class="{ 'note-sets-grid--loading': isSectionLoading }">
        <v-card
          v-for="(noteSet, index) in visibleNoteSets"
          :key="noteSetKeyOf(noteSet)"
          class="note-sets-card fade-up"
          :data-tour="index === 0 ? 'notes-card' : undefined"
          :class="{
            'note-sets-card--selecting': isSelectMode,
            'note-sets-card--selected': isSelected(noteSet),
          }"
          :style="{ animationDelay: `${Math.min(index, 12) * 40}ms` }"
          hover
          @click="onCardClick(noteSet)"
        >
          <v-card-title class="d-flex align-center ga-2">
            <v-icon
              v-if="isSelectMode"
              :icon="isSelected(noteSet) ? mdiCheckboxMarked : mdiCheckboxBlankOutline"
              :color="isSelected(noteSet) ? 'primary' : undefined"
              size="small"
            />
            <span class="text-truncate">{{ noteSet.name }}</span>
            <v-spacer />
            <v-btn
              v-if="!isSelectMode"
              :icon="isPinnedNote(noteSet) ? mdiStar : mdiStarOutline"
              :color="isPinnedNote(noteSet) ? 'warning' : undefined"
              :title="isPinnedNote(noteSet) ? '取消置顶' : '置顶'"
              density="comfortable"
              size="small"
              variant="text"
              @click.stop="togglePin(noteSet)"
            />
          </v-card-title>
          <v-card-subtitle class="d-flex flex-wrap ga-x-3 ga-y-1 text-caption">
            <span>编辑 {{ formatUpdatedAt(noteSet.updatedAt) }}</span>
            <span class="text-medium-emphasis">{{ noteSet.fileName }}.mdrf</span>
            <span v-if="lastOpenedAt(noteSet)" class="text-medium-emphasis">
              打开 {{ formatUpdatedAt(lastOpenedAt(noteSet)!) }}
            </span>
          </v-card-subtitle>
          <v-card-subtitle
            v-if="activeSection.kind === 'external'"
            class="note-sets-card__location text-truncate text-caption"
            :title="noteSet.filePath ?? '浏览器本地存储'"
          >
            位置 {{ noteSet.filePath ?? '浏览器本地存储' }}
          </v-card-subtitle>
          <v-card-text>
            <div class="note-sets-card__desc">{{ noteSet.description || '暂无描述' }}</div>
            <div v-if="noteSet.tag.length" class="mt-2 d-flex flex-wrap ga-1">
              <v-chip
                v-for="tag in noteSet.tag"
                :key="tag"
                :color="resolveTagColor(tag)"
                size="x-small"
                variant="tonal"
              >
                {{ tag }}
              </v-chip>
            </div>
          </v-card-text>
          <v-card-actions v-if="!isSelectMode" @click.stop>
            <v-btn @click="openDetail(noteSet)" :icon="mdiInformationOutline" variant="text" />
            <v-btn
              @click="openEditor(noteSet)"
              @pointerenter="preloadEditor"
              @focus="preloadEditor"
              :icon="mdiPencil"
              :loading="noteSet.loading"
              class="ms-2"
              variant="text"
            />
            <v-btn
              v-if="isWebEnv && activeSection.kind === 'workspace'"
              @click="exportNoteSet(noteSet)"
              :icon="mdiDownload"
              :loading="exportingFileName === noteSet.fileName"
              variant="text"
            />
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
            />
            <v-menu v-if="canMoveNote" location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  :icon="mdiFolderMove"
                  title="移动到工作区"
                  variant="text"
                />
              </template>
              <v-list density="compact" min-width="200">
                <v-list-item
                  v-for="target in moveTargetsOf(noteSet)"
                  :key="target.id"
                  @click="moveNoteToWorkspace(noteSet, target.dir)"
                >
                  <v-list-item-title>{{ target.name }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
            <v-spacer />
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" :icon="mdiDotsVertical" title="更多操作" variant="text" />
              </template>
              <v-list density="compact" min-width="160">
                <v-list-item @click="togglePin(noteSet)">
                  <template #prepend>
                    <v-icon
                      :icon="isPinnedNote(noteSet) ? mdiStar : mdiStarOutline"
                      :color="isPinnedNote(noteSet) ? 'warning' : undefined"
                      size="small"
                    />
                  </template>
                  <v-list-item-title>
                    {{ isPinnedNote(noteSet) ? '取消置顶' : '置顶' }}
                  </v-list-item-title>
                </v-list-item>
                <v-list-item @click="openRenameNote(noteSet)">
                  <template #prepend>
                    <v-icon :icon="mdiRenameBox" size="small" />
                  </template>
                  <v-list-item-title>重命名</v-list-item-title>
                </v-list-item>
                <v-list-item @click="copyFromCard(noteSet)">
                  <template #prepend>
                    <v-icon :icon="mdiContentCopy" size="small" />
                  </template>
                  <v-list-item-title>创建副本</v-list-item-title>
                </v-list-item>
                <v-list-item @click="openExport(noteSet, 'html')">
                  <template #prepend>
                    <v-icon :icon="mdiLanguageHtml5" size="small" />
                  </template>
                  <v-list-item-title>导出为 HTML</v-list-item-title>
                </v-list-item>
                <v-list-item @click="openExport(noteSet, 'pdf')">
                  <template #prepend>
                    <v-icon :icon="mdiFilePdfBox" size="small" />
                  </template>
                  <v-list-item-title>导出为 PDF</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
                <v-list-item @click="askDelete([noteSet])">
                  <template #prepend>
                    <v-icon :icon="mdiDeleteOutline" size="small" />
                  </template>
                  <v-list-item-title>删除</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </v-card-actions>
        </v-card>
        <div ref="listSentinel" class="note-sets-grid__sentinel" />
      </div>
    </div>
    <input ref="uploadInput" type="file" accept=".mdrf" class="d-none" @change="onUploadSelected" />
    <div class="speed-dial-anchor">
      <v-speed-dial location="top center" transition="fade-transition">
        <template #activator="{ props: activatorProps }">
          <v-fab
            v-bind="activatorProps"
            :icon="mdiPlus"
            :loading="isImporting"
            color="primary"
            data-tour="notes-fab"
          />
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
    <NoteDetailDialog
      :is-open="isDetailOpen"
      :note="detailTarget"
      @update:close="isDetailOpen = $event.status"
      @saved="onDetailSaved"
    />
    <ExportNoteDialog
      v-if="exportNote"
      v-model="isExportOpen"
      :mode="exportMode"
      :note="exportNote"
      :title="exportTitle"
    />
    <v-dialog v-model="isRenameDialogOpen" max-width="420">
      <v-card>
        <v-card-title>重命名工作区</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameDraft"
            label="工作区名称"
            :counter="30"
            autofocus
            @keyup.enter="submitRenameWorkspace"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn color="error" variant="text" @click="isRenameDialogOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="text" @click="submitRenameWorkspace">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="isRenameNoteOpen" max-width="420">
      <v-card>
        <v-card-title>重命名笔记</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameNoteDraft"
            label="文件名"
            :counter="NOTE_FILE_NAME_MAX_LEN"
            :error-messages="renameNoteError"
            :maxlength="NOTE_FILE_NAME_MAX_LEN"
            autofocus
            @keyup.enter="submitRenameNote"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn color="error" variant="text" @click="isRenameNoteOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="text" @click="submitRenameNote">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="isDeleteOpen" max-width="420">
      <v-card>
        <v-card-title>删除 {{ deleteTargets.length }} 份笔记？</v-card-title>
        <v-card-text>文件会从磁盘移除，此操作无法撤销。</v-card-text>
        <v-card-actions>
          <v-btn color="primary" variant="text" @click="isDeleteOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn color="error" variant="text" @click="confirmDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <TourKitLayer :tour="tour" />
  </v-sheet>
</template>

<style scoped>
/* 便签纸质感：细横线 + 一条页边线 + 主题柔光，避免冷硬的工程网格 */
.note-sets-page {
  height: 100%;
  background-image:
    radial-gradient(1200px 600px at 88% -10%, rgba(var(--v-theme-primary), 0.1), transparent 70%),
    linear-gradient(90deg, rgba(var(--v-theme-primary), 0.14) 0 1px, transparent 1px),
    repeating-linear-gradient(
      180deg,
      transparent 0 27px,
      rgba(var(--v-theme-primary), 0.09) 27px 28px
    );
  background-position:
    0 0,
    40px 0,
    0 0;
  background-repeat: no-repeat, repeat-y, repeat;
  background-size:
    auto,
    100% 100%,
    100% 28px;
}

.note-filter-dialog__content {
  min-width: 0;
}

.note-filter-dialog__tags {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
}

.note-filter-dialog__match-mode {
  display: flex;
  width: 100%;
}

.note-filter-dialog__match-mode :deep(.v-btn) {
  flex: 1 1 0;
  min-width: 0;
  white-space: normal;
}

.note-filter-dialog__actions {
  flex-wrap: wrap;
}

/* VFab 的 app 定位在 speed dial 的 activator 插槽里拿不到 VApp 布局上下文，所以自己固定在右下角 */
.speed-dial-anchor {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1005;
}

/* 列宽随内容区自适应，窗口变窄时自然减少列数而不是把卡片挤瘦 */
.note-sets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-items: stretch;
  transition: opacity 160ms ease;
}

.note-sets-grid--loading {
  opacity: 0.72;
}

/* 同行卡片由 grid 拉齐，描述区吃满剩余高度，操作栏统一贴底 */
.note-sets-card {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.note-sets-card__location {
  min-width: 0;
}

/* 描述固定两行，避免长文本把同行卡片全拉高 */
.note-sets-card__desc {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  min-height: 2.5em;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

/* 多选时整卡是热区，要挡住文本选择让点击稳定落成切换 */
.note-sets-card--selecting {
  user-select: none;
}

/* 用 outline 而非 border：卡片尺寸不变，网格不会因选中而抖动 */
.note-sets-card--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.note-sets-card :deep(.v-card-text) {
  flex: 1 1 auto;
}

/* 哨兵不占列位，否则会白白多出一格 */
.note-sets-grid__sentinel {
  grid-column: 1 / -1;
}

/* 滚动交给列表自身：页面容器留在原位，FAB 与路由内容不随滚动移位 */
.note-sets-scroll {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
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

/* 入场淡入：与首页同一节奏，reduced-motion 下关闭 */
.fade-up {
  opacity: 0;
  animation: fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 599px) {
  .note-sets-grid {
    gap: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .note-sets-grid {
    transition-duration: 1ms;
  }

  .fade-up {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
