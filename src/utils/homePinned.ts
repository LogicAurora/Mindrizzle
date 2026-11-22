import { ref } from 'vue';

import { getSetting, setSetting } from './settingsStore';

const PINNED_KEY = 'home:pinned';

export interface PinnedNoteRef {
  fileName: string;
  dir?: string;
  filePath?: string;
}

// 与 NoteSets.vue 的 noteSetKeyOf 保持一致：dir|filePath|fileName
export const pinKeyOf = (note: PinnedNoteRef): string =>
  `${note.dir ?? ''}|${note.filePath ?? ''}|${note.fileName}`;

export const pinnedKeys = ref<string[]>([]);

let isPinnedLoaded = false;

export const loadPinnedNotes = async (force = false): Promise<void> => {
  if (isPinnedLoaded && !force) return;
  const stored = await getSetting<unknown>(PINNED_KEY);
  pinnedKeys.value = Array.isArray(stored)
    ? stored.filter((key): key is string => typeof key === 'string')
    : [];
  isPinnedLoaded = true;
};

const persistPinned = (): Promise<void> => setSetting(PINNED_KEY, pinnedKeys.value);

export const isPinnedNote = (note: PinnedNoteRef): boolean =>
  pinnedKeys.value.includes(pinKeyOf(note));

export const togglePinnedNote = async (note: PinnedNoteRef): Promise<boolean> => {
  const key = pinKeyOf(note);
  const has = pinnedKeys.value.includes(key);
  pinnedKeys.value = has
    ? pinnedKeys.value.filter((item) => item !== key)
    : [key, ...pinnedKeys.value];
  await persistPinned();
  return !has;
};

export const removePinnedKey = async (key: string): Promise<void> => {
  if (!pinnedKeys.value.includes(key)) return;
  pinnedKeys.value = pinnedKeys.value.filter((item) => item !== key);
  await persistPinned();
};

// 文件重命名后位置变了，pin 的复合键也要跟着换，否则置顶会凭空消失
export const renamePinnedKey = async (oldKey: string, nextKey: string): Promise<void> => {
  if (oldKey === nextKey || !pinnedKeys.value.includes(oldKey)) return;
  pinnedKeys.value = pinnedKeys.value.map((item) => (item === oldKey ? nextKey : item));
  await persistPinned();
};

// 首页加载后回查：磁盘上已不存在的置顶键顺手清掉，避免留悬空项
export const prunePinnedKeys = async (validKeys: Set<string>): Promise<void> => {
  const remaining = pinnedKeys.value.filter((key) => validKeys.has(key));
  if (remaining.length === pinnedKeys.value.length) return;
  pinnedKeys.value = remaining;
  await persistPinned();
};
