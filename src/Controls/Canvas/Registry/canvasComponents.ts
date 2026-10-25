import type { NodeJSON } from '@prosekit/core'
import { defineAsyncComponent, type AsyncComponentLoader } from 'vue'

import type { EditorCommands } from '../Components/RichEditor/extension.ts'
import { blockDefinitionOf, blockDefinitions, registerBlocks } from '../Sdk/blockRegistry.ts'
import type { AnyBlockDefinition, BlockEnv } from '../Sdk/block.types.ts'
import { normalizeConstraints, type ResizeConstraints } from './resizeConstraints.ts'

// config 由块自定义，画布只按不透明字典搬运与持久化
export type WidgetConfig = Record<string, unknown>

export type RichTextConfig = WidgetConfig & {
  content: NodeJSON | null
  autoHeight?: boolean
}

export type CodeBlockConfig = WidgetConfig & {
  code: string
  language: string
}

export type TestBenchConfig = WidgetConfig & {
  counter: number
  note: string
  showViewport?: boolean
}

export type ImageFit = 'contain' | 'cover' | 'fill' | 'tile'

export type ImageBlockConfig = WidgetConfig & {
  // 归档内的相对路径，读取时再经 ComponentDataStore 拼成 mdrfcd://
  path: string
  mime: string
  alt: string
  fit: ImageFit
  autoSize: boolean
}

export type FileBlockConfig = WidgetConfig & {
  // 归档内路径固定为 file.bin，显示名与类型单独存，换文件不会在归档里留垃圾
  path: string
  name: string
  mime: string
  size: number
}

export type LinkBlockConfig = WidgetConfig & {
  url: string
  title: string
  description: string
  siteName: string
  imageUrl: string
}

export type TableBlockConfig = WidgetConfig & {
  rows: string[][]
  header: boolean
}

export interface TaskItem {
  id: string
  text: string
  done: boolean
}

export type TaskListBlockConfig = WidgetConfig & {
  title: string
  tasks: TaskItem[]
}

export interface ComponentController {
  saveConfig?: () => Partial<WidgetConfig>
  loadConfig?: (config: WidgetConfig) => void
  // SDK 宿主块用这三个方法取代 saveConfig/loadConfig：配置由块自持，画布只负责搬运
  flushConfig?: () => Partial<WidgetConfig>
  applyConfig?: (config: WidgetConfig) => void
  snapshotHtml?: () => string
  commands?: EditorCommands
  resolveDropAtElement?: (el: HTMLElement | null, preferBefore: boolean) => number | null
  scrollContent?: (deltaY: number) => void
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasItem {
  uuid: string
  component: string
  config: WidgetConfig
  layout: {
    desktop: Rect
    mobile: Rect
  }
  arranged: {
    desktop: boolean
    mobile: boolean
  }
}

// 新增块只需在 Components 下放一对同名文件（Xxx.block.ts + Xxx.vue），注册表自动收集
const blockMetaModules = import.meta.glob('../Components/**/*.block.ts', { eager: true })
// 只扫块本身所在目录；子目录（RichEditor/、CodeBlock/）由各自的 .block.ts 直接引用，避免被异步包装
const blockComponentModules = import.meta.glob('../Components/*.vue')

const loadBuiltinBlocks = (): AnyBlockDefinition[] =>
  Object.entries(blockMetaModules)
    .map(([metaPath, module]) => {
      const meta = (module as { default: AnyBlockDefinition }).default
      // 自带壳的块必须保留真实实例，否则 expose（commands / saveConfig）会被异步包装挡住
      if (meta.kind === 'raw') return meta
      const loader = blockComponentModules[metaPath.replace(/\.block\.ts$/, '.vue')]
      if (!loader) throw new Error(`块 ${meta.key} 缺少同名组件文件：${metaPath}`)
      return { ...meta, component: defineAsyncComponent(loader as AsyncComponentLoader) }
    })
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0) || first.key.localeCompare(second.key))

registerBlocks(loadBuiltinBlocks())

export const CANVAS_COMPONENTS = blockDefinitions()

export type ComponentKey = string

export const DEFAULT_COMPONENT_KEY: ComponentKey = 'RichTextEditor'

export const componentMetaOf = (key: string): AnyBlockDefinition | undefined => blockDefinitionOf(key)

export const componentLabelOf = (key: string) => componentMetaOf(key)?.title ?? key

// 注册项声明自身尺寸可变性，画布据此判断联结该不该改它
export const heightChangableOf = (
  item: Pick<CanvasItem, 'component' | 'config'>,
  env: BlockEnv,
): boolean => componentMetaOf(item.component)?.heightChangableOf?.(item.config, env) ?? true

export const widthChangableOf = (
  item: Pick<CanvasItem, 'component' | 'config'>,
  env: BlockEnv,
): boolean => componentMetaOf(item.component)?.widthChangableOf?.(item.config, env) ?? true

const CANVAS_DEFAULT_CONSTRAINTS: Required<ResizeConstraints> = {
  minWidth: 100,
  maxWidth: null,
  minHeight: 100,
  maxHeight: null,
}

export const constraintsOf = (item: Pick<CanvasItem, 'component'>): Required<ResizeConstraints> => {
  const raw = componentMetaOf(item.component)?.constraints
  return raw ? normalizeConstraints(raw) : CANVAS_DEFAULT_CONSTRAINTS
}
