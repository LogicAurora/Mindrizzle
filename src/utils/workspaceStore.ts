// SPDX-License-Identifier: MIT
import { ref } from 'vue'

import { getSetting, setSetting } from './settingsStore'

export interface WorkspaceDirectory {
  id: string
  name: string
  dir: string
}

export interface ExternalNoteRecord {
  // 桌面端用绝对路径，网页端导入副本用 IndexedDB 里的笔记名；两者只会有一个
  path?: string
  localName?: string
  fileName: string
  name: string
  updatedAt: number
}

const DIRECTORIES_KEY = 'workspace:directories'
const EXTERNAL_NOTES_KEY = 'workspace:external-notes'
const EXTERNAL_NOTE_LIMIT = 20
const WORKSPACE_NAME_MAX_LEN = 30
const TRAILING_SEPARATORS = /[\\/]+$/
const PATH_SEPARATORS = /[\\/]/

export const workspaceDirectories = ref<WorkspaceDirectory[]>([])
export const externalNotes = ref<ExternalNoteRecord[]>([])

const baseNameOf = (path: string): string => path.split(PATH_SEPARATORS).filter(Boolean).pop() ?? path

export const loadWorkspaceState = async (): Promise<void> => {
  const [directories, notes] = await Promise.all([
    getSetting<WorkspaceDirectory[]>(DIRECTORIES_KEY),
    getSetting<ExternalNoteRecord[]>(EXTERNAL_NOTES_KEY),
  ])
  workspaceDirectories.value = directories ?? []
  externalNotes.value = notes ?? []
}

// 目录路径本身就是稳定标识，重复添加同一目录直接复用
export const addWorkspaceDirectory = async (dirPath: string): Promise<WorkspaceDirectory> => {
  const dir = dirPath.replace(TRAILING_SEPARATORS, '')
  const existing = workspaceDirectories.value.find((item) => item.dir === dir)
  if (existing) return existing
  const entry: WorkspaceDirectory = { id: dir, name: baseNameOf(dir), dir }
  workspaceDirectories.value = [...workspaceDirectories.value, entry]
  await setSetting(DIRECTORIES_KEY, workspaceDirectories.value)
  return entry
}

export const removeWorkspaceDirectory = async (id: string): Promise<void> => {
  workspaceDirectories.value = workspaceDirectories.value.filter((item) => item.id !== id)
  await setSetting(DIRECTORIES_KEY, workspaceDirectories.value)
}

export const renameWorkspaceDirectory = async (id: string, name: string): Promise<void> => {
  const resolvedName = name.trim().slice(0, WORKSPACE_NAME_MAX_LEN)
  if (!resolvedName) throw new Error('工作区名称不能为空')
  workspaceDirectories.value = workspaceDirectories.value.map((item) =>
    item.id === id ? { ...item, name: resolvedName } : item,
  )
  await setSetting(DIRECTORIES_KEY, workspaceDirectories.value)
}

// 只挪显示顺序，id 仍是目录路径，切换工作区与文件寻址都不受影响
export const moveWorkspaceDirectory = async (id: string, offset: number): Promise<void> => {
  const directories = [...workspaceDirectories.value]
  const index = directories.findIndex((item) => item.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= directories.length) return
  const [entry] = directories.splice(index, 1)
  directories.splice(target, 0, entry)
  workspaceDirectories.value = directories
  await setSetting(DIRECTORIES_KEY, directories)
}

export const externalNoteKeyOf = (record: ExternalNoteRecord): string =>
  record.path ?? record.localName ?? ''

export const rememberExternalNote = async (note: ExternalNoteRecord): Promise<void> => {
  const key = externalNoteKeyOf(note)
  const rest = externalNotes.value.filter((item) => externalNoteKeyOf(item) !== key)
  externalNotes.value = [note, ...rest].slice(0, EXTERNAL_NOTE_LIMIT)
  await setSetting(EXTERNAL_NOTES_KEY, externalNotes.value)
}

export const forgetExternalNote = async (key: string): Promise<void> => {
  externalNotes.value = externalNotes.value.filter((item) => externalNoteKeyOf(item) !== key)
  await setSetting(EXTERNAL_NOTES_KEY, externalNotes.value)
}
