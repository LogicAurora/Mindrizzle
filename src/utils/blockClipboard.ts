// SPDX-License-Identifier: MIT
import { ref } from "vue";

import { getCurrentNote } from "./noteContext";

export interface ClipboardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClipboardBlock {
  uuid: string;
  component: string;
  config: unknown;
  layout: ClipboardRect;
  arranged: boolean;
}

// 画布只提供块快照，来源与时间由剪贴板补齐；跨笔记粘贴要靠来源定位资产文件
export interface ClipboardSnapshot {
  blocks: ClipboardBlock[];
  links: string[];
}

export interface ClipboardSource {
  fileName: string;
  dir?: string;
  filePath?: string;
}

export interface ClipboardEntry extends ClipboardSnapshot {
  id: string;
  createdAt: number;
  source: ClipboardSource;
}

const STORAGE_KEY = "mindrizzle:canvas-clipboard";
const MAX_ENTRIES = 20;
// 大图的 config 可能不小，localStorage 总配额有限，超出就丢最旧的记录
const MAX_STORAGE_CHARS = 512 * 1024;

export const clipboardEntries = ref<ClipboardEntry[]>([]);

let isLoaded = false;

function isClipboardBlock(value: unknown): value is ClipboardBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<ClipboardBlock>;
  const rect = block.layout;
  return (
    typeof block.uuid === "string" &&
    typeof block.component === "string" &&
    typeof block.arranged === "boolean" &&
    !!rect &&
    typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.w === "number" &&
    typeof rect.h === "number"
  );
}

function normalizeEntry(raw: unknown): ClipboardEntry | null {
  const entry = raw as Partial<ClipboardEntry> | null;
  if (
    !entry ||
    !Array.isArray(entry.blocks) ||
    !entry.blocks.length ||
    !entry.blocks.every(isClipboardBlock)
  )
    return null;
  if (!entry.source || typeof entry.source.fileName !== "string") return null;
  return {
    id:
      typeof entry.id === "string"
        ? entry.id
        : String(entry.createdAt ?? Date.now()),
    createdAt:
      typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
    source: {
      fileName: entry.source.fileName,
      dir: entry.source.dir,
      filePath: entry.source.filePath,
    },
    blocks: entry.blocks,
    links: Array.isArray(entry.links)
      ? entry.links.filter((key): key is string => typeof key === "string")
      : [],
  };
}

export function loadClipboardEntries(): void {
  if (isLoaded) return;
  isLoaded = true;
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    const entries = Array.isArray(parsed)
      ? parsed
          .map(normalizeEntry)
          .filter((entry): entry is ClipboardEntry => entry !== null)
      : [];
    clipboardEntries.value = entries;
    if (Array.isArray(parsed) && entries.length !== parsed.length) persist();
  } catch {
    // 忽略，剪贴板损坏不影响画布
    clipboardEntries.value = [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clipboardEntries.value));
  } catch {
    // 忽略，超配额时内存里的历史仍可用
  }
}

const sameSnapshot = (
  entry: ClipboardSnapshot,
  snapshot: ClipboardSnapshot,
): boolean =>
  JSON.stringify({ blocks: entry.blocks, links: entry.links }) ===
  JSON.stringify({ blocks: snapshot.blocks, links: snapshot.links });

// 重复复制同一组块时只刷新时间并提到最前，避免历史被同一条内容刷屏
export function pushClipboardEntry(
  snapshot: ClipboardSnapshot,
): ClipboardEntry {
  const entry: ClipboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    source: { ...getCurrentNote() },
    blocks: snapshot.blocks,
    links: snapshot.links,
  };
  const remaining = clipboardEntries.value.filter(
    (item) => !sameSnapshot(item, snapshot),
  );
  const next = [entry, ...remaining];
  while (
    next.length > MAX_ENTRIES ||
    JSON.stringify(next).length > MAX_STORAGE_CHARS
  )
    next.pop();
  clipboardEntries.value = next;
  persist();
  return entry;
}
