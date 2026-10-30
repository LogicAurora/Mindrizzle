// getClientRects 在跨行内 span 的边界会给出重复矩形，叠两层半透明背景会发深
const MIN_RECT_SIZE = 1

export interface TextRect {
  left: number
  top: number
  width: number
  height: number
}

export function uniqueClientRects(range: Range): TextRect[] {
  const seen = new Set<string>()
  const result: TextRect[] = []
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width <= MIN_RECT_SIZE || rect.height <= MIN_RECT_SIZE) continue
    const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }
  return result
}
