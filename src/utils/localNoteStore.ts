// 网页端没有 Tauri IPC，笔记文件层退化为 IndexedDB：正文与元信息按结构化克隆存取，不做 tar/压缩
import type { InvokeArgs } from '@tauri-apps/api/core'

import { buildMdrfBlob } from './mdrfArchive'

const DB_NAME = 'mindrizzle-local'
const DB_VERSION = 1
const STORE_NAME = 'kv'
const QUOTA_ERROR_NAME = 'QuotaExceededError'
const FILE_INDEX_KEY = 'mindrizzle:file-index'
const NOTE_KEY_PREFIX = 'mindrizzle:note:'
const COMPONENT_DATA_KEY_PREFIX = 'mindrizzle:component-data:'
const TEST_NOTE_PREFIX = '性能测试_'
const MDRF_EXTENSION = '.mdrf'
const FILE_NAME_MAX_LEN = 50
const COMPONENT_UUID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const COMPONENT_PATH_MAX_LEN = 512
const COMPONENT_PATH_FORBIDDEN_CHARS = /[\\:*?"<>|\u0000-\u001f]/
const FILE_NAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/
// 与后端 resolve_mdrf_file_name 对齐：首字符不得空格，尾字符不得空格或点
const FILE_NAME_EDGE_CHARS = /^ |[ .]$/
const FILE_NAME_RESERVED = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]

export interface NoteMeta {
  title: string
  description: string
  tag: string[]
}

interface NoteRecord {
  meta: NoteMeta
  content: string
  updatedAt: number
}

type NoteCommandArgs = Record<string, unknown>

const noteKeyOf = (fileName: string): string => `${NOTE_KEY_PREFIX}${fileName}`

let databasePromise: Promise<IDBDatabase> | null = null
let isPersistenceRequested = false

// 浏览器默认把站点数据当可驱逐的 best-effort 存储，申请持久化才只在手动清理时删除；被拒只是保持可驱逐，不影响读写
const requestPersistentStorage = (): void => {
  if (isPersistenceRequested) return
  isPersistenceRequested = true
  if (typeof navigator.storage?.persist !== 'function') return
  navigator.storage
    .persisted()
    .then((isPersisted) => (isPersisted ? true : navigator.storage.persist()))
    .catch(() => undefined)
}

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    // 版本升级时必须同步建表，否则后续事务取不到 objectStore
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains(STORE_NAME)) return
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      requestPersistentStorage()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
  })
  // 打开失败不缓存，下次调用还能重试
  databasePromise = opening.catch((error: unknown) => {
    databasePromise = null
    throw error
  })
  return databasePromise
}

const resolveTransactionError = (transaction: IDBTransaction): Error => {
  if (transaction.error?.name === QUOTA_ERROR_NAME) return new Error('浏览器站点存储空间不足')
  return transaction.error ?? new Error('IndexedDB 事务失败')
}

const runRead = async <T>(key: string): Promise<T | null> => {
  const database = await openDatabase()
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
  return value ?? null
}

const runWrite = async (action: (store: IDBObjectStore) => void): Promise<void> => {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    action(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(resolveTransactionError(transaction))
    transaction.onabort = () => reject(resolveTransactionError(transaction))
  })
}

const runReadKeys = async (): Promise<IDBValidKey[]> => {
  const database = await openDatabase()
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

const readFileIndex = async (): Promise<string[]> => (await runRead<string[]>(FILE_INDEX_KEY)) ?? []

const writeFileIndex = (fileNames: string[]): Promise<void> =>
  runWrite((store) => store.put(fileNames, FILE_INDEX_KEY))

const readNote = (fileName: string): Promise<NoteRecord | null> => runRead<NoteRecord>(noteKeyOf(fileName))

const writeNote = (fileName: string, note: NoteRecord): Promise<void> =>
  runWrite((store) => store.put(note, noteKeyOf(fileName)))

const padNumber = (value: number): string => String(value).padStart(2, '0')

const buildDefaultFileName = (): string => {
  const now = new Date()
  const date = [now.getFullYear(), padNumber(now.getMonth() + 1), padNumber(now.getDate())].join('-')
  const time = [padNumber(now.getHours()), padNumber(now.getMinutes()), padNumber(now.getSeconds())].join('-')
  return `我的笔记_${date}_${time}`
}

const resolveFileName = (fileName: string): string => {
  const resolved = fileName === '' ? buildDefaultFileName() : fileName
  if (resolved.length > FILE_NAME_MAX_LEN || FILE_NAME_EDGE_CHARS.test(resolved)) {
    throw new Error('文件名过长或首尾含非法字符')
  }
  if (FILE_NAME_FORBIDDEN_CHARS.test(resolved)) {
    throw new Error('文件名不能包含 \\ / : * ? " < > | 等字符')
  }
  if (FILE_NAME_RESERVED.includes(resolved.toUpperCase())) {
    throw new Error('文件名不能是系统保留设备名')
  }
  return resolved
}

const requireNote = async (fileName: string): Promise<{ resolved: string; note: NoteRecord }> => {
  const resolved = resolveFileName(fileName)
  const note = await readNote(resolved)
  if (!note) throw new Error('文件不存在或者是个目录')
  return { resolved, note }
}

const fetchFileList = (): Promise<string[]> => readFileIndex()

// 后端只比对磁盘占用，故此处同样只看索引里是否已存在
const isFileNameValid = async (fileName: string): Promise<boolean> =>
  !(await readFileIndex()).includes(fileName)

const getFileMeta = async (fileName: string): Promise<NoteMeta & { updatedAt: number }> => {
  const { note } = await requireNote(fileName)
  // 旧存档无 updatedAt，故容忍缺失
  return { ...note.meta, updatedAt: note.updatedAt ?? 0 }
}

const getFileBody = async (fileName: string): Promise<{ content: string }> => ({
  content: (await requireNote(fileName)).note.content,
})

const setFileBody = async (fileName: string, content: string): Promise<void> => {
  const { resolved, note } = await requireNote(fileName)
  await writeNote(resolved, { ...note, content, updatedAt: Date.now() })
}

const createFile = async (meta: NoteMeta, fileName: string): Promise<string> => {
  const resolved = resolveFileName(fileName)
  if (await readNote(resolved)) throw new Error('同名文件已存在')
  await writeNote(resolved, { meta, content: '', updatedAt: Date.now() })
  await writeFileIndex([...(await readFileIndex()), resolved])
  return resolved
}

// 调试页清空测试存档用；这个库只存放本模块写入的键
export const clearLocalNotes = (): Promise<void> => runWrite((store) => store.clear())

// 列表性能测试样本：整批样本与索引共用一个事务，样本数大时也不至于反复提交
export const createTestNotes = async (count: number): Promise<string[]> => {
  const existing = new Set(await readFileIndex())
  const fileNames = Array.from({ length: count }, (_, index) => `${TEST_NOTE_PREFIX}${index}`)
  const updatedAt = Date.now()
  await runWrite((store) => {
    fileNames.forEach((fileName) => {
      if (existing.has(fileName)) return
      store.put({
        meta: { title: fileName, description: '便签集列表性能测试样本', tag: ['测试'] },
        content: '',
        updatedAt,
      }, noteKeyOf(fileName))
    })
    const merged = [...existing, ...fileNames.filter((name) => !existing.has(name))]
    store.put(merged, FILE_INDEX_KEY)
  })
  return fileNames
}

export const clearTestNotes = async (): Promise<number> => {
  const fileNames = await readFileIndex()
  const testNames = fileNames.filter((name) => name.startsWith(TEST_NOTE_PREFIX))
  const remaining = fileNames.filter((name) => !name.startsWith(TEST_NOTE_PREFIX))
  await runWrite((store) => {
    testNames.forEach((name) => store.delete(noteKeyOf(name)))
    store.put(remaining, FILE_INDEX_KEY)
  })
  return testNames.length
}

// 笔记 + 组件一条键，值是该组件所有文件的 base64 映射；路径层级直接存在键名字符串里
interface ComponentScope {
  key: string
  uuid: string
}

const resolveComponentScope = (args: NoteCommandArgs): ComponentScope => {
  const request = args.request as { fileName: string; uuid: string }
  const fileName = resolveFileName(String(request.fileName))
  const uuid = String(request.uuid)
  if (!COMPONENT_UUID_PATTERN.test(uuid)) throw new Error('组件 UUID 非法')
  return { key: `${COMPONENT_DATA_KEY_PREFIX}${fileName}:${uuid}`, uuid }
}

// 浏览器端没有真实路径，入口校验仍与后端保持一致，避免两端行为漂移
const resolveComponentFile = (args: NoteCommandArgs): ComponentScope & { path: string } => {
  const scope = resolveComponentScope(args)
  const path = String((args.request as { path?: string }).path ?? '')
  const hasBadSegment =
    path === '' ||
    path.length > COMPONENT_PATH_MAX_LEN ||
    COMPONENT_PATH_FORBIDDEN_CHARS.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  if (hasBadSegment) throw new Error('组件数据路径为空或含非法片段')
  return { ...scope, path }
}

const readComponentFiles = async (key: string): Promise<Record<string, string>> =>
  (await runRead<Record<string, string>>(key)) ?? {}

const writeComponentFiles = (key: string, files: Record<string, string>): Promise<void> =>
  runWrite((store) => store.put(files, key))

const listComponentFiles = async (args: NoteCommandArgs): Promise<string[]> => {
  const { key } = resolveComponentScope(args)
  return Object.keys(await readComponentFiles(key)).sort()
}

const readComponentFile = async (args: NoteCommandArgs): Promise<string> => {
  const { key, path } = resolveComponentFile(args)
  const content = (await readComponentFiles(key))[path]
  if (content === undefined) throw new Error('组件数据文件不存在')
  return content
}

const writeComponentFile = async (args: NoteCommandArgs): Promise<void> => {
  const { key, path } = resolveComponentFile(args)
  const contentBase64 = String((args.request as { contentBase64?: string }).contentBase64 ?? '')
  const files = await readComponentFiles(key)
  files[path] = contentBase64
  await writeComponentFiles(key, files)
}

const deleteComponentFile = async (args: NoteCommandArgs): Promise<void> => {
  const { key, path } = resolveComponentFile(args)
  const files = await readComponentFiles(key)
  if (!(path in files)) return
  delete files[path]
  if (Object.keys(files).length) await writeComponentFiles(key, files)
  else await runWrite((store) => store.delete(key))
}

const componentFileExists = async (args: NoteCommandArgs): Promise<boolean> => {
  const { key, path } = resolveComponentFile(args)
  return path in (await readComponentFiles(key))
}

const readComponentData = async (fileName: string): Promise<Record<string, Record<string, string>>> => {
  const prefix = `${COMPONENT_DATA_KEY_PREFIX}${fileName}:`
  const keys = await runReadKeys()
  const scopes: Record<string, Record<string, string>> = {}
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue
    const files = await readComponentFiles(key)
    scopes[key.slice(prefix.length)] = files
  }
  return scopes
}

const triggerDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // 立刻 revoke 会让部分浏览器的下载被取消，所以推到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const exportLocalNoteMdrf = async (fileName: string): Promise<string> => {
  const { resolved, note } = await requireNote(fileName)
  const blob = await buildMdrfBlob({
    meta: note.meta,
    content: note.content,
    componentData: await readComponentData(resolved),
  })
  const downloadName = `${resolved}${MDRF_EXTENSION}`
  triggerDownload(blob, downloadName)
  return downloadName
}

const COMMAND_HANDLERS: Record<string, (args: NoteCommandArgs) => unknown> = {
  fetch_file_list: () => fetchFileList(),
  is_file_name_valid: (args) => isFileNameValid(String(args.fileName)),
  get_mdr_file_meta: (args) => getFileMeta(String(args.fileName)),
  get_mdr_file_body: (args) => getFileBody(String(args.fileName)),
  set_mdr_file_body: (args) => setFileBody(String(args.fileName), String(args.content)),
  create_mdr_file: (args) => createFile(args.mdrFileInfo as NoteMeta, String(args.fileName)),
  list_component_data_files: listComponentFiles,
  read_component_data_file: readComponentFile,
  write_component_data_file: writeComponentFile,
  delete_component_data_file: deleteComponentFile,
  component_data_file_exists: componentFileExists,
}

export async function invokeLocalNoteCommand<T>(command: string, args?: InvokeArgs): Promise<T> {
  const handler = COMMAND_HANDLERS[command]
  if (!handler) throw new Error(`浏览器端未实现命令：${command}`)
  return (await handler(args as NoteCommandArgs)) as T
}
