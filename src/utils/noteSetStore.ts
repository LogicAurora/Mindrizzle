// SPDX-License-Identifier: MIT
import { ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { info } from '@tauri-apps/plugin-log'

import { getErrorMessage } from './getErrorMessage'
import { invokeCommand } from './invoke'

export interface NoteSetEntry {
  fileName: string
  name: string
  description: string
  tag?: string
  updatedAt: number
}

export interface NoteSetLoadResult {
  entryCount: number
  durationMs: number
  fromCache: boolean
}

interface NoteSetMeta {
  title: string
  description: string
  tag: string
  updatedAt: number
}

const noteSetEntries = ref<NoteSetEntry[]>([])
export const lastNoteSetLoad = ref<NoteSetLoadResult | null>(null)

let loadPromise: Promise<NoteSetEntry[]> | null = null
let isCacheReady = false

// 插件日志在浏览器里没有 IPC，上报会直接抛错，所以只在桌面端输出
function appendNoteSetLog(message: string): void {
  if (isTauri()) info(`[noteSet] ${message}`)
}

async function fetchNoteSetEntry(fileName: string): Promise<NoteSetEntry> {
  const meta = await invokeCommand<NoteSetMeta>('get_mdr_file_meta', { fileName })
  return {
    fileName,
    name: meta.title,
    description: meta.description,
    tag: meta.tag,
    updatedAt: meta.updatedAt,
  }
}

async function fetchNoteSetEntries(): Promise<NoteSetEntry[]> {
  const fileNames = await invokeCommand<string[]>('fetch_file_list')
  return Promise.all(fileNames.map(fetchNoteSetEntry))
}

function commitNoteSetEntries(entries: NoteSetEntry[], startedAt: number): NoteSetEntry[] {
  noteSetEntries.value = entries
  isCacheReady = true
  const durationMs = performance.now() - startedAt
  lastNoteSetLoad.value = { entryCount: entries.length, durationMs, fromCache: false }
  appendNoteSetLog(`拉取完成，${entries.length} 条，耗时 ${durationMs.toFixed(1)} ms`)
  return entries
}

function startNoteSetLoad(): Promise<NoteSetEntry[]> {
  const startedAt = performance.now()
  appendNoteSetLog('开始拉取列表')
  loadPromise = fetchNoteSetEntries()
    .then((entries) => commitNoteSetEntries(entries, startedAt))
    .catch((error: unknown) => {
      appendNoteSetLog(`拉取失败：${getErrorMessage(error)}`)
      throw error
    })
    .finally(() => {
      loadPromise = null
    })
  return loadPromise
}

// 离开 /set 会销毁 NoteSets，不缓存得在每次返回时重跑一遍「列表 + 逐条元信息」
export function loadNoteSetEntries(force = false): Promise<NoteSetEntry[]> {
  if (isCacheReady && !force) {
    lastNoteSetLoad.value = { entryCount: noteSetEntries.value.length, durationMs: 0, fromCache: true }
    appendNoteSetLog(`缓存命中，${noteSetEntries.value.length} 条`)
    return Promise.resolve(noteSetEntries.value)
  }
  if (loadPromise) {
    appendNoteSetLog('复用进行中的拉取')
    return loadPromise
  }
  return startNoteSetLoad()
}

export function invalidateNoteSetEntries(): void {
  isCacheReady = false
  loadPromise = null
  appendNoteSetLog('缓存失效')
}

// 保存只刷新归档 mtime，改时间戳即可让列表保持最新，无须回头重取整份列表
export function touchNoteSetUpdatedAt(fileName: string): void {
  const entry = noteSetEntries.value.find((item) => item.fileName === fileName)
  if (!entry) return
  entry.updatedAt = Date.now()
  appendNoteSetLog(`更新时间戳：${fileName}`)
}
