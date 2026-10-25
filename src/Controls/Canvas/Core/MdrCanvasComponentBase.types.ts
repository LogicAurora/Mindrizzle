import type { CSSProperties } from 'vue'
import type { EdgeMask, HandlePlacement } from './blockFloatGeometry.ts'
import type { BlockInteractionHandlers } from './canvasComponentControllers.ts'

/** 画布壳层属性：几何、层级、交互态与控制器回调，不含任何块类型语义。 */
export interface MdrCanvasComponentBaseProps {
  uuid: string
  x: number
  y: number
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number | null
  maxHeight?: number | null
  widthChangable?: boolean
  heightChangable?: boolean
  icon: string
  title: string
  draggable?: boolean
  readOnly?: boolean
  compact?: boolean
  active?: boolean
  dragging?: boolean
  // undefined = 块自己管虚拟化（raw 旧写法）；false/true = 由壳统一渲染内容/快照
  virtualized?: boolean
  snapshot?: string
  showHandle?: boolean
  showSettings?: boolean
  // 带默认插槽的宿主恒有 settings 插槽，需显式告知是否真有内容
  settingsAvailable?: boolean
  handles?: string[]
  zIndex?: number
  zoom?: number
  placement?: HandlePlacement
  popupOpen?: boolean
  cornerStyle?: CSSProperties
  masks?: EdgeMask[]
  handlers: BlockInteractionHandlers
}

// 具体块组件自行决定图标与标题，画布只传通用属性
export type MdrCanvasComponentShellProps = Omit<MdrCanvasComponentBaseProps, 'icon' | 'title'>

export interface MdrCanvasComponentContentProps<TConfig> {
  config: TConfig
  base: MdrCanvasComponentShellProps
}
