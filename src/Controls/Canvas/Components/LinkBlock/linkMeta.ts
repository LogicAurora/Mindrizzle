// 聊天里复制来的链接常常没有协议，补 https 再解析
export const parseHttpUrl = (raw: string): URL | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export const resolveUrl = (raw: string, base: string): string => {
  if (!raw) return ''
  try {
    return new URL(raw, base || undefined).href
  } catch {
    return ''
  }
}

const MAX_HTML_CHARS = 512 * 1024

export interface LinkMeta {
  title: string
  description: string
  siteName: string
  imageUrl: string
}

export const readLinkMeta = (html: string, baseUrl: string): LinkMeta => {
  const doc = new DOMParser().parseFromString(html.slice(0, MAX_HTML_CHARS), 'text/html')
  const metaOf = (...selectors: string[]) => {
    for (const selector of selectors) {
      const content = doc.querySelector<HTMLMetaElement>(selector)?.content?.trim()
      if (content) return content
    }
    return ''
  }
  return {
    title: metaOf('meta[property="og:title"]', 'meta[name="twitter:title"]') || doc.title.trim(),
    description: metaOf(
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ),
    siteName: metaOf('meta[property="og:site_name"]', 'meta[name="application-name"]'),
    imageUrl: resolveUrl(metaOf('meta[property="og:image"]', 'meta[name="twitter:image"]'), baseUrl),
  }
}

// 跨域站点读不到 HTML 是浏览器策略，调用方据此退回手填
export const fetchLinkMeta = async (url: string, signal: AbortSignal): Promise<LinkMeta> => {
  const response = await fetch(url, { credentials: 'omit', signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return readLinkMeta(await response.text(), url)
}
