// SPDX-License-Identifier: MIT
import { invokeCommand } from './invoke'
import { getCurrentNote } from './noteContext'

// 外部文件与自定义工作区靠 dir/filePath 定位，组件数据命令必须带上同一份上下文
const noteSourceOf = (): { dir?: string; filePath?: string } => {
  const { dir, filePath } = getCurrentNote()
  return { dir, filePath }
}

// URL 自带笔记名：块组件拿不到路由参数，且 URL 可能存进 config 后再读回
export const MDRFCD_SCHEME = 'mdrfcd://'

// 一次性展开超大数组会爆调用栈，所以分块拼二进制串
const BASE64_CHUNK_SIZE = 0x8000
const COMPONENT_UUID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
// 长度与字符白名单须和 Rust 的 normalize_component_path 保持一致
const COMPONENT_PATH_MAX_LEN = 512
const INVALID_PATH_CHARS = /[\\:*?"<>|\u0000-\u001f]/

export interface MdrfcdLocation {
  fileName: string
  uuid: string
  path: string
}

// Tauri IPC 的 JSON 会把字节数组拆成数字列表，体积膨胀数倍，所以统一走 base64
const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

const decodeBase64 = (text: string): Uint8Array => {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const encodePath = (path: string): string =>
  path.split('/').map(encodeURIComponent).join('/')

const validateComponentPath = (path: string): void => {
  // 路径会拼进归档条目并解压到磁盘，这里挡掉与后端相同的穿越片段
  const hasBadSegment =
    path === '' ||
    path.length > COMPONENT_PATH_MAX_LEN ||
    INVALID_PATH_CHARS.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  if (hasBadSegment) throw new Error('组件数据路径为空或含非法片段')
}

const validatePathSegments = (path: string): void => {
  if (path === '') return
  const hasBadSegment =
    path.length > COMPONENT_PATH_MAX_LEN ||
    INVALID_PATH_CHARS.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  if (hasBadSegment) throw new Error('组件数据路径含非法片段')
}

/** 解析已持久化的 mdrfcd URL，供组件读取自己存过的文件位置 */
export function parseMdrfcdUrl(url: string): MdrfcdLocation {
  if (!url.startsWith(MDRFCD_SCHEME)) {
    throw new Error(`组件数据 URL 必须以 ${MDRFCD_SCHEME} 开头`)
  }
  const [rawFileName, uuid, ...pathSegments] = url.slice(MDRFCD_SCHEME.length).split('/')
  if (!rawFileName || !uuid) throw new Error('组件数据 URL 缺少笔记名或组件 UUID')
  if (!COMPONENT_UUID_PATTERN.test(uuid)) throw new Error('组件数据 URL 的组件 UUID 非法')
  // 先按 '/' 切再解码，笔记名里编码过的 %2F 不能变回路径分隔符
  const path = pathSegments.map(decodeURIComponent).join('/')
  validatePathSegments(path)
  return { fileName: decodeURIComponent(rawFileName), uuid, path }
}

/** 组件私有文件入口：URL 对应 `.mdrf` 归档内 `ComponentsData/<组件 UUID>/<相对路径>`。 */
export class ComponentDataStore {
  private readonly fileName: string

  constructor(fileName: string = getCurrentNote().fileName) {
    // 缺省绑定编辑页写入的当前笔记，显式传参便于测试或跨笔记操作
    this.fileName = fileName
  }

  urlOf(uuid: string, path: string): string {
    if (!COMPONENT_UUID_PATTERN.test(uuid)) throw new Error('组件 UUID 非法')
    validateComponentPath(path)
    if (!this.fileName) throw new Error('当前没有打开的笔记')
    // 笔记名可能含空格/中文，所以逐段编码；uuid 已限字符集，无需编码
    return `${MDRFCD_SCHEME}${encodeURIComponent(this.fileName)}/${uuid}/${encodePath(path)}`
  }

  async writeFile(url: string, content: string | Uint8Array): Promise<void> {
    const location = parseMdrfcdUrl(url)
    validateComponentPath(location.path)
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
    await invokeCommand('write_component_data_file', {
      request: { ...location, ...noteSourceOf(), contentBase64: encodeBase64(bytes) },
    })
  }

  async readFile(url: string): Promise<Uint8Array> {
    const location = parseMdrfcdUrl(url)
    validateComponentPath(location.path)
    const encoded = await invokeCommand<string>('read_component_data_file', { request: { ...location, ...noteSourceOf() } })
    return decodeBase64(encoded)
  }

  async readText(url: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(url))
  }

  // 另存到用户选定路径；网页端没有文件系统，调用方自己下载 Blob
  async exportFile(url: string, targetPath: string): Promise<void> {
    const location = parseMdrfcdUrl(url)
    validateComponentPath(location.path)
    await invokeCommand('export_component_data_file', {
      request: { ...location, ...noteSourceOf(), targetPath },
    })
  }

  async deleteFile(url: string): Promise<void> {
    const location = parseMdrfcdUrl(url)
    validateComponentPath(location.path)
    await invokeCommand('delete_component_data_file', { request: { ...location, ...noteSourceOf() } })
  }

  async hasFile(url: string): Promise<boolean> {
    const location = parseMdrfcdUrl(url)
    validateComponentPath(location.path)
    return invokeCommand<boolean>('component_data_file_exists', { request: { ...location, ...noteSourceOf() } })
  }

  async listFiles(scope: string): Promise<string[]> {
    // 传 uuid 时用实例绑定的笔记，传根 URL 时以 URL 里的笔记为准
    const location = scope.startsWith(MDRFCD_SCHEME)
      ? parseMdrfcdUrl(scope)
      : { fileName: this.fileName, uuid: scope, path: '' }
    if (!COMPONENT_UUID_PATTERN.test(location.uuid) || !location.fileName) {
      throw new Error('组件数据范围非法')
    }
    return invokeCommand<string[]>('list_component_data_files', {
      request: { fileName: location.fileName, uuid: location.uuid, ...noteSourceOf() },
    })
  }
}

// 富文本嵌入节点拖出成块时要换 uuid，数据目录得跟着搬；抽出是低频操作，逐个写回可接受
export async function copyComponentFiles(sourceUuid: string, targetUuid: string): Promise<void> {
  if (!sourceUuid || !targetUuid || sourceUuid === targetUuid) return
  const store = new ComponentDataStore()
  const files = await store.listFiles(sourceUuid)
  for (const path of files) {
    const bytes = await store.readFile(store.urlOf(sourceUuid, path))
    await store.writeFile(store.urlOf(targetUuid, path), bytes)
  }
}
