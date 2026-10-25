import type { Component } from 'vue'

import type { CanvasViewData } from '../Core/canvasComponentControllers.ts'
import type { ResizeConstraints } from '../Registry/resizeConstraints.ts'

export interface BlockSize {
  w: number
  h: number
}

export interface BlockEnv {
  isCompact: boolean
  isReadOnly: boolean
}

/** 块私有文件，路径相对归档内 ComponentsData/<uuid>/ */
export interface BlockFiles {
  url: (path: string) => string
  readText: (path: string) => Promise<string>
  readBinary: (path: string) => Promise<Uint8Array>
  write: (path: string, content: string | Uint8Array) => Promise<void>
  list: () => Promise<string[]>
  remove: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
}

export interface BlockContext<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  readonly uuid: string
  readonly config: TConfig
  readonly readOnly: boolean
  readonly isCompact: boolean
  readonly isActive: boolean
  readonly files: BlockFiles
  setConfig: (patch: Partial<TConfig>) => void
  getSize: () => BlockSize
  moveBy: (dx: number, dy: number) => void
  resizeTo: (size: Partial<BlockSize>) => void
  /** 视图每次按需读：放进渲染函数会随每帧 pan/zoom 重渲染整个块 */
  getView: () => CanvasViewData
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number) => void
  /** 块内有可定位的列表/编辑器时，注册后才能接收画布拖入 */
  setDropHandlers: (handlers: BlockDropHandlers | null) => void
  /** 块内自持编辑器（如 ProseMirror）时，把命令对象交给画布工具栏 */
  setCommands: (commands: unknown) => void
}

/** html = 克隆块内 DOM；none = 只留占位；函数 = 自绘静态 HTML（canvas/WebGL 类必须用这个，root 为当前块内 DOM） */
export type BlockSnapshot<TConfig> =
  | 'html'
  | 'none'
  | ((config: TConfig, root: HTMLElement | null) => string)

export interface BlockDropHandlers {
  /** 画布拖组件入块时解析插入位置，返回 null 表示不接收 */
  resolveDropAtElement: (el: HTMLElement | null, preferBefore: boolean) => number | null
  /** 拖拽贴边时让块内内容自行滚动 */
  scrollContent?: (deltaY: number) => void
}

export interface BlockEmbed<TConfig extends Record<string, unknown>> {
  /** ProseMirror 节点名，富文本内按此名解析块 */
  nodeName: string
  toProps: (config: TConfig) => Record<string, unknown>
  fromProps: (props: Record<string, unknown>) => TConfig
  /** 富文本内复用同一组件，缺省取 content */
  component?: Component
  aspectRatio?: number | null
}

export interface BlockDefinition<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  key: string
  title: string
  icon: string
  addId: string
  // 添加菜单顺序；不填按 0，同序按 key
  order?: number
  defaultConfig: () => TConfig
  defaultSize: BlockSize
  constraints?: ResizeConstraints
  snapshot?: BlockSnapshot<TConfig>
  /** 拖拽栏标题/图标可随 config 变化，缺省用 title/icon */
  titleOf?: (config: TConfig) => string
  iconOf?: (config: TConfig) => string
  widthChangableOf?: (config: TConfig, env: BlockEnv) => boolean
  heightChangableOf?: (config: TConfig, env: BlockEnv) => boolean
  /** 块主体组件：用 useBlockContext() 取 ctx，用 <BlockSettings> 写设置面板 */
  component?: Component
  embed?: BlockEmbed<TConfig>
  /** 可接收画布块拖拽落点（富文本为 true） */
  acceptsDrop?: boolean
  /** raw 表示组件自带壳层，宿主只按原样挂载 */
  kind?: 'block' | 'raw'
  rawComponent?: Component
}

// 注册表按 key 混存不同 config 类型，取用处按自身 config 断言
export type AnyBlockDefinition = BlockDefinition<any>
