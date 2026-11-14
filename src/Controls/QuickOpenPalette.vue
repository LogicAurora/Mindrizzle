<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { mdiFileDocumentOutline } from '@mdi/js';

import { fetchNoteSetEntry, loadNoteSetEntries } from '../utils/noteSetStore';
import type { NoteSetEntry } from '../utils/noteSetStore';
import {
  commandPaletteShortcut,
  loadCommandPaletteShortcut,
  matchesCommandPaletteShortcut,
  OPEN_COMMAND_PALETTE_EVENT,
} from '../utils/commandPaletteShortcut';
import { loadRecentNotes, type RecentNote } from '../utils/homeActivity';
import { externalNotes, loadWorkspaceState, workspaceDirectories } from '../utils/workspaceStore';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useOpenNote } from '../utils/useOpenNote';

const notes = ref<NoteSetEntry[]>([]);
const recentNoteRefs = ref<RecentNote[]>([]);
const isOpen = ref(false);
const isErrorOpen = ref(false);
const errorMessage = ref('');
const openNote = useOpenNote();

const noteKeyOf = (note: Pick<NoteSetEntry, 'fileName' | 'dir' | 'filePath'>): string =>
  `${note.filePath ?? ''}\u0000${note.dir ?? ''}\u0000${note.fileName}`;

const paletteItems = computed(() => {
  const updatedNotes = [...notes.value].sort((left, right) => right.updatedAt - left.updatedAt);
  const noteByKey = new Map(updatedNotes.map((note) => [noteKeyOf(note), note]));
  const recentNotes = recentNoteRefs.value
    .map((note) => noteByKey.get(noteKeyOf(note)))
    .filter((note): note is NoteSetEntry => Boolean(note));
  const recentKeys = new Set(recentNotes.map(noteKeyOf));
  const toItem = (note: NoteSetEntry) => ({
    title: note.name,
    subtitle: `${note.fileName}.mdrf${note.description ? ` · ${note.description}` : ''}`,
    prependIcon: mdiFileDocumentOutline,
    onClick: () => void openSelectedNote(note),
  });
  return [
    { type: 'subheader' as const, title: '最近打开' },
    ...recentNotes.map(toItem),
    { type: 'divider' as const },
    { type: 'subheader' as const, title: '所有文件' },
    ...updatedNotes.filter((note) => !recentKeys.has(noteKeyOf(note))).map(toItem),
  ];
});

async function loadNotes(): Promise<void> {
  await loadWorkspaceState();
  const directories = [undefined, ...workspaceDirectories.value.map((directory) => directory.dir)];
  const workspaceEntries = await Promise.all(
    directories.map((directory) => loadNoteSetEntries(directory)),
  );
  const externalEntries = await Promise.all(
    externalNotes.value.map(async (record) => {
      try {
        return await fetchNoteSetEntry(record.localName ?? record.fileName, undefined, record.path);
      } catch (error) {
        console.warn(`最近打开的文件不可用：${record.fileName}`, error);
        return null;
      }
    }),
  );
  const entries = [...workspaceEntries.flat(), ...externalEntries].filter(
    (note): note is NoteSetEntry => note !== null,
  );
  notes.value = [...new Map(entries.map((note) => [noteKeyOf(note), note])).values()];
  recentNoteRefs.value = loadRecentNotes();
}

async function openSelectedNote(note: NoteSetEntry): Promise<void> {
  isOpen.value = false;
  try {
    await openNote({
      fileName: note.fileName,
      ...(note.dir ? { dir: note.dir } : {}),
      ...(note.filePath ? { filePath: note.filePath } : {}),
    });
    recentNoteRefs.value = loadRecentNotes();
  } catch (error) {
    errorMessage.value = `打开失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  }
}

function openPalette(): void {
  isOpen.value = true;
  void loadNotes().catch((error: unknown) => {
    errorMessage.value = `命令面板文件列表刷新失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.repeat) return;
  const target = event.target;
  if (target instanceof Element && target.closest('[data-shortcut-capture]')) return;
  if (!matchesCommandPaletteShortcut(event)) return;
  event.preventDefault();
  event.stopPropagation();
  openPalette();
}

function handleOpenEvent(): void {
  openPalette();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
  void Promise.all([loadCommandPaletteShortcut(), loadNotes()]).catch((error: unknown) => {
    errorMessage.value = `命令面板初始化失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
});
</script>

<template>
  <v-command-palette
    v-model="isOpen"
    :items="paletteItems"
    :placeholder="`搜索文件（${commandPaletteShortcut}）`"
    no-data-text="没有找到文件"
    close-on-select
  />
  <v-snackbar v-model="isErrorOpen" color="error" timeout="4000">
    {{ errorMessage }}
  </v-snackbar>
</template>
