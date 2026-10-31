// SPDX-License-Identifier: MIT
import { ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { info } from '@tauri-apps/plugin-log'

import { getErrorMessage } from './getErrorMessage'
import { invokeCommand } from './invoke'
import { sanitizeTags } from './tagStore'
import { workspaceDirectories } from './workspaceStore'

export interface NoteSetEntry {
  fileName: string
  name: string
  description: string
  tag: string[]
  updatedAt: number
  dir?: string
  filePath?: string
}

export interface NoteSetLoadResult {
  entryCount: number
  durationMs: number
  fromCache: boolean
}

interface NoteSetMeta {
  title: string
  description: string
  tag: string[]
  updatedAt: number
}

const entriesByDir = new Map<string, NoteSetEntry[]>()
const pendingLoads = new Map<string, Promise<NoteSetEntry[]>>()
export const lastNoteSetLoad = ref<NoteSetLoadResult | null>(null)

const cacheKeyOf = (dir?: string): string => dir ?? ''

// 插件日志在浏览器里没有 IPC，上报会直接抛错，所以只在桌面端输出
function appendNoteSetLog(message: string): void {
  if (isTauri()) info(`[noteSet] ${message}`)
}

export async function fetchNoteSetEntry(
  fileName: string,
  dir?: string,
  filePath?: string,
): Promise<NoteSetEntry> {
  const meta = await invokeCommand<NoteSetMeta>('get_mdr_file_meta', { fileName, dir, filePath })
  return {
    fileName,
    dir,
    filePath,
    name: meta.title,
    description: meta.description,
    tag: meta.tag,
    updatedAt: meta.updatedAt,
  }
}

async function fetchNoteSetEntries(dir?: string): Promise<NoteSetEntry[]> {
  const fileNames = await invokeCommand<string[]>('fetch_file_list', { dir })
  return Promise.all(fileNames.map((fileName) => fetchNoteSetEntry(fileName, dir)))
}

function commitNoteSetEntries(
  key: string,
  entries: NoteSetEntry[],
  startedAt: number,
): NoteSetEntry[] {
  entriesByDir.set(key, entries)
  const durationMs = performance.now() - startedAt
  lastNoteSetLoad.value = { entryCount: entries.length, durationMs, fromCache: false }
  appendNoteSetLog(`拉取完成，${entries.length} 条，耗时 ${durationMs.toFixed(1)} ms`)
  return entries
}

function startNoteSetLoad(dir: string | undefined, key: string): Promise<NoteSetEntry[]> {
  const startedAt = performance.now()
  appendNoteSetLog('开始拉取列表')
  const loading = fetchNoteSetEntries(dir)
    .then((entries) => commitNoteSetEntries(key, entries, startedAt))
    .catch((error: unknown) => {
      appendNoteSetLog(`拉取失败：${getErrorMessage(error)}`)
      throw error
    })
    .finally(() => {
      pendingLoads.delete(key)
    })
  pendingLoads.set(key, loading)
  return loading
}

// 离开 /set 会销毁 NoteSets，不缓存得在每次返回时重跑一遍「列表 + 逐条元信息」
export function loadNoteSetEntries(dir?: string, force = false): Promise<NoteSetEntry[]> {
  const key = cacheKeyOf(dir)
  const cached = entriesByDir.get(key)
  if (cached && !force) {
    lastNoteSetLoad.value = { entryCount: cached.length, durationMs: 0, fromCache: true }
    appendNoteSetLog(`缓存命中，${cached.length} 条`)
    return Promise.resolve(cached)
  }
  const pending = pendingLoads.get(key)
  if (pending) {
    appendNoteSetLog('复用进行中的拉取')
    return pending
  }
  return startNoteSetLoad(dir, key)
}

export function invalidateNoteSetEntries(dir?: string): void {
  // 不传目录就清全部：新建、保存、导入都可能跨工作区影响缓存
  if (dir === undefined) {
    entriesByDir.clear()
    pendingLoads.clear()
  } else {
    entriesByDir.delete(dir)
  }
  appendNoteSetLog('缓存失效')
}

// 保存只刷新归档 mtime，改时间戳即可让列表保持最新，无须回头重取整份列表
export function touchNoteSetUpdatedAt(fileName: string, dir?: string): void {
  const entry = entriesByDir.get(cacheKeyOf(dir))?.find((item) => item.fileName === fileName)
  if (!entry) return
  entry.updatedAt = Date.now()
  appendNoteSetLog(`更新时间戳：${fileName}`)
}

// 详情弹窗只改标题/描述/标签，原对象就地改掉比整表重取快得多
export function patchNoteSetMeta(entry: NoteSetEntry): void {
  const cached = entriesByDir
    .get(cacheKeyOf(entry.dir))
    ?.find((item) => item.fileName === entry.fileName)
  if (!cached) return
  cached.name = entry.name
  cached.description = entry.description
  cached.tag = entry.tag
  cached.updatedAt = entry.updatedAt
}

interface NoteTagPatch {
  fileName: string
  dir?: string
  // 返回 null 表示这条笔记不需要改，省掉一次整包重写
  resolveTags: (tags: string[]) => string[] | null
}

async function patchNoteTags(patch: NoteTagPatch): Promise<boolean> {
  const { fileName, dir, resolveTags } = patch
  const meta = await invokeCommand<NoteSetMeta>('get_mdr_file_meta', { fileName, dir })
  const tag = resolveTags(meta.tag ?? [])
  if (!tag) return false
  await invokeCommand('set_mdr_file_meta', {
    fileName,
    dir,
    mdrFileInfo: { title: meta.title, description: meta.description, tag },
  })
  return true
}

// 标签以名字标识，库里改名或删除都得回写引用它的笔记，否则会留下悬空标签
async function updateNoteTags(resolveTags: (tags: string[]) => string[] | null): Promise<number> {
  const dirs = [undefined, ...workspaceDirectories.value.map((entry) => entry.dir)]
  let changedCount = 0
  for (const dir of dirs) {
    const fileNames = await invokeCommand<string[]>('fetch_file_list', { dir })
    for (const fileName of fileNames) {
      if (await patchNoteTags({ fileName, dir, resolveTags })) changedCount += 1
    }
  }
  if (changedCount) invalidateNoteSetEntries()
  appendNoteSetLog(`标签回写：${changedCount} 条笔记`)
  return changedCount
}

export function renameTagInNotes(oldName: string, nextName: string): Promise<number> {
  return updateNoteTags((tags) => {
    if (!tags.includes(oldName)) return null
    return sanitizeTags(tags.map((item) => (item === oldName ? nextName : item)))
  })
}

export function removeTagFromNotes(name: string): Promise<number> {
  return updateNoteTags((tags) => {
    if (!tags.includes(name)) return null
    return sanitizeTags(tags.filter((item) => item !== name))
  })
}
