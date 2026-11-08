import type { NoteFileLocation } from "../fileOperations/types";

const ACTIVITY_KEY = "mindrizzle:home-activity";
const RECENT_NOTES_KEY = "mindrizzle:recent-notes";
const MAX_ACTIVITY_EVENTS = 10_000;
const MAX_RECENT_NOTES = 20;

export type FileActivityKind = "created" | "modified" | "deleted";

export interface FileActivityEvent {
  kind: FileActivityKind;
  timestamp: number;
}

export interface RecentNote extends NoteFileLocation {
  openedAt: number;
}

function readStorage<T>(
  key: string,
  isValid: (value: unknown) => value is T,
  empty: T,
): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return empty;
    const parsed: unknown = JSON.parse(stored);
    if (isValid(parsed)) return parsed;
    console.error(`首页记录格式无效（${key}）`);
    return empty;
  } catch (error) {
    console.error(`读取首页记录失败（${key}）`, error);
    return empty;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`保存首页记录失败（${key}）`, error);
  }
}

function isActivityEvents(value: unknown): value is FileActivityEvent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        (item.kind === "created" ||
          item.kind === "modified" ||
          item.kind === "deleted") &&
        Number.isFinite(item.timestamp),
    )
  );
}

function isRecentNotes(value: unknown): value is RecentNote[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item.fileName === "string" &&
        Number.isFinite(item.openedAt),
    )
  );
}

export function recordFileActivity(kind: FileActivityKind): void {
  const events = readStorage(ACTIVITY_KEY, isActivityEvents, []);
  events.push({ kind, timestamp: Date.now() });
  writeStorage(ACTIVITY_KEY, events.slice(-MAX_ACTIVITY_EVENTS));
}

export function loadFileActivity(): FileActivityEvent[] {
  return readStorage(ACTIVITY_KEY, isActivityEvents, []);
}

function recentNoteKey(note: NoteFileLocation): string {
  return `${note.filePath ?? ""}\u0000${note.dir ?? ""}\u0000${note.fileName}`;
}

export function recordRecentNote(note: NoteFileLocation): void {
  const recent = readStorage(RECENT_NOTES_KEY, isRecentNotes, []);
  const next = [
    { ...note, openedAt: Date.now() },
    ...recent.filter((item) => recentNoteKey(item) !== recentNoteKey(note)),
  ];
  writeStorage(RECENT_NOTES_KEY, next.slice(0, MAX_RECENT_NOTES));
}

export function loadRecentNotes(): RecentNote[] {
  return readStorage(RECENT_NOTES_KEY, isRecentNotes, []);
}
