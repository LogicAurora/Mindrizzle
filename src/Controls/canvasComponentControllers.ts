import type { InjectionKey } from 'vue'
import type { Rect, WidgetConfig } from './canvasComponents.ts'

export interface BlockSize {
  width: number
  height: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasViewData {
  zoom: number
  pan: CanvasPoint
  origin: CanvasPoint
  viewport: { left: number; top: number; right: number; bottom: number } | null
  block: Rect
  isPanning: boolean
}

export interface SizeChangeable {
  width: boolean
  height: boolean
}

/** 块内组件申请移动自身与改变尺寸；画布负责联结、吸附与推动。 */
export interface BlockComponentController {
  moveBy: (dx: number, dy: number) => void
  resizeTo: (size: Partial<BlockSize>) => void
  getSize: () => BlockSize
  getChangeable: () => SizeChangeable
}

/** 块内组件申请移动画布、改变缩放或读取当前视图数据。 */
export interface BlockCanvasController {
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number) => void
  getViewData: () => CanvasViewData
}

// 画布按块缓存回调，避免逐次渲染换引用触发子组件重渲染
export interface BlockInteractionHandlers {
  moveBy: (dx: number, dy: number) => void
  resizeTo: (size: Partial<BlockSize>) => void
  panCanvas: (dx: number, dy: number) => void
  zoomCanvas: (zoom: number) => void
  getCanvasView: () => CanvasViewData
  writeConfig: (patch: Partial<WidgetConfig>) => void
  updateConfig: (patch: Partial<WidgetConfig>) => void
}

export const COMPONENT_CONTROLLER_KEY: InjectionKey<BlockComponentController> = Symbol('mdr:component-controller')
export const CANVAS_CONTROLLER_KEY: InjectionKey<BlockCanvasController> = Symbol('mdr:canvas-controller')
