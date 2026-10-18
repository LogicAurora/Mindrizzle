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
const XML_ESCAPE_PATTERN = /[&<>"']/g
const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

const encoder = new TextEncoder()

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
