// 网页端导出的 .mdrf 必须能被 Rust 侧解开：gzip(tar)，根目录 meta.json/body.json，组件数据在 ComponentsData/<uuid>/

const TAR_BLOCK_SIZE = 512
const TAR_NAME_MAX = 100
const TAR_PREFIX_OFFSET = 345
const TAR_PREFIX_MAX = 155
const TAR_CHECKSUM_OFFSET = 148
const TAR_CHECKSUM_LENGTH = 8
const TAR_MAGIC_OFFSET = 257
const TAR_MODE_OFFSET = 100
const TAR_UID_OFFSET = 108
const TAR_GID_OFFSET = 116
const TAR_SIZE_OFFSET = 124
const TAR_MTIME_OFFSET = 136
const TAR_TYPEFLAG_OFFSET = 156
const TAR_OCTAL_DIGITS = 11
const TAR_CHECKSUM_DIGITS = 6
const SLASH_BYTE = 0x2f
const SPACE_BYTE = 0x20
const REGULAR_FILE_TYPE = 0x30
const FILE_MODE = '0000644\0'
const OWNER_IDS = '0000000\0'
const USTAR_MAGIC = 'ustar\u000000'
const META_ENTRY_NAME = 'meta.json'
const BODY_ENTRY_NAME = 'body.json'
const COMPONENT_DIR = 'ComponentsData'
const GZIP_FIRST_BYTE = 0x1f
const GZIP_SECOND_BYTE = 0x8b
const TAR_OCTAL_BASE = 8
const BASE64_CHUNK_SIZE = 0x8000
const XML_ESCAPE_PATTERN = /[&<>"']/g
const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface MdrfMeta {
  title: string
  description: string
  tag: string[]
}

export interface MdrfArchiveSource {
  meta: MdrfMeta
  content: string
  componentData: Record<string, Record<string, string>>
}

export interface ParsedMdrfArchive extends MdrfArchiveSource {}

interface TarFile {
  name: string
  data: Uint8Array
}

const escapeXmlText = (value: string): string =>
  value.replace(XML_ESCAPE_PATTERN, (char) => XML_ENTITIES[char] ?? char)

const serializeMetaXml = (meta: MdrfMeta): string => {
  const tags = meta.tag.map((tag) => `<tag>${escapeXmlText(tag)}</tag>`).join('')
  const title = escapeXmlText(meta.title)
  const description = escapeXmlText(meta.description)
  return `<meta><title>${title}</title><description>${description}</description>${tags}</meta>`
}

const serializeBodyXml = (content: string): string =>
  `<body><content>${escapeXmlText(content)}</content></body>`

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const padToBlock = (size: number): number => Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE

const writeAscii = (target: Uint8Array, offset: number, text: string): void => {
  target.set(encoder.encode(text), offset)
}

// ustar 的名字只有 100 字节，更长的路径按 prefix/name 在最后一个斜杠处拆开
const findTarNameSplit = (encodedName: Uint8Array): number => {
  for (let index = encodedName.length - 1; index > 0; index--) {
    if (encodedName[index] !== SLASH_BYTE) continue
    if (encodedName.length - index - 1 > TAR_NAME_MAX) break
    if (index <= TAR_PREFIX_MAX) return index
  }
  return -1
}

const writeTarName = (header: Uint8Array, name: string): void => {
  const encodedName = encoder.encode(name)
  if (encodedName.length <= TAR_NAME_MAX) {
    header.set(encodedName)
    return
  }
  const splitOffset = findTarNameSplit(encodedName)
  if (splitOffset < 0) throw new Error('组件数据路径过长，无法写入归档')
  header.set(encodedName.subarray(0, splitOffset), TAR_PREFIX_OFFSET)
  header.set(encodedName.subarray(splitOffset + 1))
}

const buildTarHeader = (file: TarFile, mtimeSeconds: number): Uint8Array => {
  const header = new Uint8Array(TAR_BLOCK_SIZE)
  writeTarName(header, file.name)
  writeAscii(header, TAR_MODE_OFFSET, FILE_MODE)
  writeAscii(header, TAR_UID_OFFSET, OWNER_IDS)
  writeAscii(header, TAR_GID_OFFSET, OWNER_IDS)
  writeAscii(header, TAR_SIZE_OFFSET, `${file.data.length.toString(8).padStart(TAR_OCTAL_DIGITS, '0')}\0`)
  writeAscii(header, TAR_MTIME_OFFSET, `${mtimeSeconds.toString(8).padStart(TAR_OCTAL_DIGITS, '0')}\0`)
  header.fill(SPACE_BYTE, TAR_CHECKSUM_OFFSET, TAR_CHECKSUM_OFFSET + TAR_CHECKSUM_LENGTH)
  header[TAR_TYPEFLAG_OFFSET] = REGULAR_FILE_TYPE
  writeAscii(header, TAR_MAGIC_OFFSET, USTAR_MAGIC)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  writeAscii(
    header,
    TAR_CHECKSUM_OFFSET,
    `${checksum.toString(8).padStart(TAR_CHECKSUM_DIGITS, '0')}\0 `,
  )
  return header
}

const buildTar = (files: TarFile[]): Uint8Array<ArrayBuffer> => {
  const mtimeSeconds = Math.floor(Date.now() / 1000)
  const payloadSize = files.reduce((sum, file) => sum + TAR_BLOCK_SIZE + padToBlock(file.data.length), 0)
  // 末尾两块全零是 tar 的结束标记，缺了 tar crate 会报意外结束
  const archive = new Uint8Array(payloadSize + TAR_BLOCK_SIZE * 2)
  let offset = 0
  files.forEach((file) => {
    archive.set(buildTarHeader(file, mtimeSeconds), offset)
    offset += TAR_BLOCK_SIZE
    archive.set(file.data, offset)
    offset += padToBlock(file.data.length)
  })
  return archive
}

const buildTarFiles = (source: MdrfArchiveSource): TarFile[] => {
  const files: TarFile[] = [
    { name: META_ENTRY_NAME, data: encoder.encode(serializeMetaXml(source.meta)) },
    { name: BODY_ENTRY_NAME, data: encoder.encode(serializeBodyXml(source.content)) },
  ]
  Object.entries(source.componentData).forEach(([uuid, entries]) => {
    Object.entries(entries).forEach(([path, base64]) => {
      files.push({ name: `${COMPONENT_DIR}/${uuid}/${path}`, data: decodeBase64(base64) })
    })
  })
  return files
}

// 旧版 WebKit 没有 CompressionStream，退回未压缩 tar，Rust 侧按魔数同样能识别
const compressTar = async (archive: Uint8Array<ArrayBuffer>): Promise<Blob> => {
  const rawBlob = new Blob([archive])
  if (typeof CompressionStream === 'undefined') return rawBlob
  const stream = rawBlob.stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

export const buildMdrfBlob = (source: MdrfArchiveSource): Promise<Blob> =>
  compressTar(buildTar(buildTarFiles(source)))

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

// Rust 侧兼容未压缩 tar，所以先看 gzip 魔数再决定要不要解压
const decompressArchive = async (buffer: ArrayBuffer): Promise<ArrayBuffer> => {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== GZIP_FIRST_BYTE || bytes[1] !== GZIP_SECOND_BYTE) return buffer
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压 .mdrf')
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

const readTarText = (bytes: Uint8Array, start: number, length: number): string => {
  const slice = bytes.subarray(start, start + length)
  const end = slice.indexOf(0)
  return decoder.decode(end >= 0 ? slice.subarray(0, end) : slice)
}

interface TarEntry {
  name: string
  data: Uint8Array
}

const parseTarEntries = (bytes: Uint8Array): TarEntry[] => {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + TAR_BLOCK_SIZE <= bytes.length) {
    const name = readTarText(bytes, offset, TAR_NAME_MAX)
    if (!name) break
    const prefix = readTarText(bytes, offset + TAR_PREFIX_OFFSET, TAR_PREFIX_MAX)
    const size = Number.parseInt(readTarText(bytes, offset + TAR_SIZE_OFFSET, TAR_OCTAL_DIGITS), TAR_OCTAL_BASE)
    if (!Number.isFinite(size) || size < 0) break
    const dataOffset = offset + TAR_BLOCK_SIZE
    entries.push({
      name: prefix ? `${prefix}/${name}` : name,
      data: bytes.subarray(dataOffset, dataOffset + size),
    })
    offset = dataOffset + padToBlock(size)
  }
  return entries
}

// 路径会随笔记一起重新打包或落到磁盘，绝对路径与 .. 片段一律不入库
const isSafeArchivePath = (name: string): boolean =>
  !name.startsWith('/') &&
  !name.startsWith('\\') &&
  name.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')

const parseXmlDocument = (text: string): Document => {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('笔记内容不是合法 XML')
  return document
}

const parseMetaXml = (xml: string): MdrfMeta => {
  const document = parseXmlDocument(xml)
  const tag = Array.from(document.querySelectorAll('meta > tag')).map((node) => node.textContent ?? '')
  return {
    title: document.querySelector('meta > title')?.textContent ?? '',
    description: document.querySelector('meta > description')?.textContent ?? '',
    tag,
  }
}

const parseBodyXml = (xml: string): string => {
  const document = parseXmlDocument(xml)
  return document.querySelector('body > content')?.textContent ?? ''
}

const parseComponentEntries = (entries: TarEntry[]): Record<string, Record<string, string>> => {
  const componentData: Record<string, Record<string, string>> = {}
  entries.forEach((entry) => {
    const relative = entry.name.startsWith(`${COMPONENT_DIR}/`)
      ? entry.name.slice(COMPONENT_DIR.length + 1)
      : ''
    if (relative === '') return
    const [uuid, ...segments] = relative.split('/')
    if (!uuid || segments.length === 0) return
    componentData[uuid] ??= {}
    componentData[uuid][segments.join('/')] = encodeBase64(entry.data)
  })
  return componentData
}

export const parseMdrfArchive = async (buffer: ArrayBuffer): Promise<ParsedMdrfArchive> => {
  const bytes = new Uint8Array(await decompressArchive(buffer))
  const entries = parseTarEntries(bytes).filter((entry) => isSafeArchivePath(entry.name))
  const metaEntry = entries.find((entry) => entry.name === META_ENTRY_NAME)
  const bodyEntry = entries.find((entry) => entry.name === BODY_ENTRY_NAME)
  if (!metaEntry || !bodyEntry) throw new Error('归档缺少 meta.json 或 body.json')
  return {
    meta: parseMetaXml(decoder.decode(metaEntry.data)),
    content: parseBodyXml(decoder.decode(bodyEntry.data)),
    componentData: parseComponentEntries(entries),
  }
}
