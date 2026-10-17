import type { CSSProperties } from 'vue'
import type { Rect } from './canvasComponents.ts'
import { Z_LAYER } from './zIndex.ts'

export type HandlePlacement = 'top' | 'bottom'

export const HANDLE_HEIGHT = 28
export const HANDLE_GAP = 2
export const SIDE_SETTINGS_WIDTH = 28
export const SIDE_SETTINGS_MARGIN = 8
export const OUTLINE_PX = 2

export type RoundToPx = (value: number) => number

interface FloatGeometryInput {
  layout: Rect
  placement: HandlePlacement
  round: RoundToPx
}

// 拖拽栏贴块上缘时顶在块外，放下缘时贴在块内底部
const floatTop = ({ layout, placement, round }: FloatGeometryInput): number =>
  placement === 'bottom' ? round(layout.y + layout.h) : round(layout.y) - round(HANDLE_HEIGHT)

export const handleBarStyleOf = (input: FloatGeometryInput): CSSProperties => {
  const { layout, placement, round } = input
  return {
    position: 'absolute',
    top: `${floatTop(input)}px`,
    left: `${round(layout.x + 10)}px`,
    height: `${round(HANDLE_HEIGHT)}px`,
    // 浮层脱离块内层叠上下文，所以置 Z_LAYER.dragHandle 保证高于选中块与描边环
    zIndex: Z_LAYER.dragHandle,
    padding: '0 10px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'grab',
    whiteSpace: 'nowrap',
    // 内联 transform 会压掉 transition 滑出动画，所以用 CSS 变量组合进动画
    '--handle-y': '0px',
    '--handle-slide': `${placement === 'bottom' ? -HANDLE_HEIGHT : HANDLE_HEIGHT}px`,
  }
}

export const sideSettingsStyleOf = (input: FloatGeometryInput): CSSProperties => {
  const { layout, round } = input
  return {
    position: 'absolute',
    top: `${floatTop(input)}px`,
    left: `${round(layout.x + layout.w) - round(SIDE_SETTINGS_WIDTH) - round(SIDE_SETTINGS_MARGIN)}px`,
    zIndex: Z_LAYER.dragHandle,
  }
}

// 命中测试不能读真实 DOM 矩形，所以按同一公式反推设置栏矩形
export const settingsBarRectOf = (layout: Rect, placement: HandlePlacement): Rect => ({
  x: layout.x + layout.w - SIDE_SETTINGS_WIDTH - SIDE_SETTINGS_MARGIN,
  y: placement === 'bottom' ? layout.y + layout.h : layout.y - HANDLE_HEIGHT,
  w: SIDE_SETTINGS_WIDTH,
  h: HANDLE_HEIGHT,
})

export interface EdgeMask {
  side: 'l' | 'r' | 't' | 'b'
  start: number
  len: number
}

// 遮罩相对 padding box 定位，所以向外偏 1px 覆盖 border
export const maskStyleOf = (mask: EdgeMask): CSSProperties => {
  const base: CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 16,
  }
  // 接触段需提示可分离，所以在 surface 底色上间隔画淡灰虚线盖住实线 border
  const dashH = `repeating-linear-gradient(90deg, rgb(var(--v-theme-surface)) 0 4px, rgba(var(--v-theme-on-surface), 0.35) 4px 6px, rgb(var(--v-theme-surface)) 6px 8px)`
  const dashV = `repeating-linear-gradient(180deg, rgb(var(--v-theme-surface)) 0 4px, rgba(var(--v-theme-on-surface), 0.35) 4px 6px, rgb(var(--v-theme-surface)) 6px 8px)`
  // 右端会溢出盖住相邻垂直边框，所以长度缩 len-2，使贴合处边框连贯
  const span = Math.max(mask.len - 2, 0)
  if (mask.side === 'l') return { ...base, left: '-1px', top: `${mask.start}px`, width: '1px', height: `${span}px`, background: dashV }
  if (mask.side === 'r') return { ...base, right: '-1px', top: `${mask.start}px`, width: '1px', height: `${span}px`, background: dashV }
  if (mask.side === 't') return { ...base, top: '-1px', left: `${mask.start}px`, height: '1px', width: `${span}px`, background: dashH }
  return { ...base, bottom: '-1px', left: `${mask.start}px`, height: '1px', width: `${span}px`, background: dashH }
}
