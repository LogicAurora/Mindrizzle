// SPDX-License-Identifier: MIT
import { computed, ref } from 'vue'

import { getSetting, setSetting } from './settingsStore'

export interface TagEntry {
  name: string
  color: string
}

// 名称即标识，name 永远是被改之前的旧名；列表页据此就地改卡片，不必整表重取
export interface TagLibraryChange {
  kind: 'rename' | 'remove'
  name: string
  nextName?: string
}

export const TAG_NAME_MAX_LEN = 20

export const TAG_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b',
  '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41',
]

const TAG_LIBRARY_KEY = 'note:tag-library'
const HASH_BASE = 31
const HASH_MODULUS = 100_000

export const tagLibrary = ref<TagEntry[]>([])

let isLibraryLoaded = false

// 名字是标签唯一标识，所以默认色由名字散列决定：换设备、重装后同名标签仍是同一色
const defaultColorOf = (name: string): string => {
  let seed = 0
  for (const char of name) seed = (seed * HASH_BASE + (char.codePointAt(0) ?? 0)) % HASH_MODULUS
  return TAG_COLORS[seed % TAG_COLORS.length]
}

const persistLibrary = (): Promise<void> => setSetting(TAG_LIBRARY_KEY, tagLibrary.value)

export const sanitizeTags = (rawTags: string[]): string[] => {
  const unique = new Set<string>()
  rawTags.forEach((rawTag) => {
    const tag = rawTag.trim().slice(0, TAG_NAME_MAX_LEN)
    if (tag) unique.add(tag)
  })
  return [...unique]
}

function buildEntry(raw: unknown): TagEntry | null {
  const source = typeof raw === 'string' ? { name: raw, color: '' } : (raw as Partial<TagEntry> | null)
  const [name] = sanitizeTags([String(source?.name ?? '')])
  if (!name) return null
  const color = String(source?.color ?? '')
  return { name, color: color || defaultColorOf(name) }
}

function normalizeLibrary(raw: unknown): TagEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.reduce<TagEntry[]>((entries, item) => {
    const entry = buildEntry(item)
    if (!entry || seen.has(entry.name)) return entries
    seen.add(entry.name)
    entries.push(entry)
    return entries
  }, [])
}

export const loadTagLibrary = async (force = false): Promise<void> => {
  // 详情弹窗每开一次都读设置会白走一趟 IPC，内存里的库已是唯一真相
  if (isLibraryLoaded && !force) return
  const stored = await getSetting<unknown>(TAG_LIBRARY_KEY)
  tagLibrary.value = normalizeLibrary(stored)
  isLibraryLoaded = true
  // 旧版本只存名字数组，读一次就迁成带色条目，之后按名字管理颜色
  if (Array.isArray(stored) && stored.some((item) => typeof item === 'string')) {
    await persistLibrary()
  }
}

// 标签库独立于单篇笔记，删掉笔记也不该丢历史标签
export const rememberTags = async (rawTags: string[]): Promise<void> => {
  const known = new Set(tagLibrary.value.map((entry) => entry.name))
  const additions = sanitizeTags(rawTags)
    .filter((name) => !known.has(name))
    .map((name) => ({ name, color: defaultColorOf(name) }))
  if (!additions.length) return
  tagLibrary.value = [...tagLibrary.value, ...additions]
  await persistLibrary()
}

export const forgetTag = async (name: string): Promise<void> => {
  const remaining = tagLibrary.value.filter((entry) => entry.name !== name)
  if (remaining.length === tagLibrary.value.length) return
  tagLibrary.value = remaining
  await persistLibrary()
}

export const setTagColor = async (name: string, color: string): Promise<void> => {
  const target = tagLibrary.value.find((entry) => entry.name === name)
  if (!target || target.color === color) return
  // 命中的是 ref 数组里的响应式代理，改完换新数组才能触发依赖重算
  target.color = color
  tagLibrary.value = [...tagLibrary.value]
  await persistLibrary()
}

// 名字即标识，重名一律拒绝；返回 false 让调用方提示而不是静默吞掉
export const renameTag = async (name: string, nextName: string): Promise<boolean> => {
  const [resolved] = sanitizeTags([nextName])
  if (!resolved || resolved === name) return false
  if (!tagLibrary.value.some((entry) => entry.name === name)) return false
  if (tagLibrary.value.some((entry) => entry.name === resolved)) return false
  tagLibrary.value = tagLibrary.value.map((entry) =>
    entry.name === name ? { ...entry, name: resolved } : entry,
  )
  await persistLibrary()
  return true
}

// 列表页每张卡片的每个 chip 都要取色，线性查找会让开销随标签数放大
const colorIndex = computed(() => {
  const index = new Map<string, string>()
  tagLibrary.value.forEach((entry) => index.set(entry.name, entry.color))
  return index
})

export const resolveTagColor = (name: string): string =>
  colorIndex.value.get(name) ?? defaultColorOf(name)
