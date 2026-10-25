import type { ImageFit } from '../../Registry/canvasComponents.ts'

// 与 Rust 侧 COMPONENT_FILE_MAX_BYTES 一致，前端先拦一次省掉整包重打的失败开销
export const MAX_IMAGE_BYTES = 64 * 1024 * 1024
export const IMAGE_EXTENSION_FALLBACK = 'bin'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
}

export const IMAGE_FITS: ImageFit[] = ['contain', 'cover', 'fill', 'tile']

// 旧配置没有 fit，回退到适应
export const toImageFit = (value: unknown): ImageFit =>
  IMAGE_FITS.includes(value as ImageFit) ? value as ImageFit : 'contain'

export const imageExtensionOf = (mime: string): string => EXTENSION_BY_MIME[mime] ?? IMAGE_EXTENSION_FALLBACK

export const baseNameOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}
