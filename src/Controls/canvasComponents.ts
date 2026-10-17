import type { NodeJSON } from '@prosekit/core'
import { defineAsyncComponent } from 'vue'
import type { EditorCommands } from './RichEditor/extension.ts'
import RichTextEditor, { isHeightChangable as isRichTextHeightChangable } from './RichEditor/RichTextEditor.vue'
import CanvasTestBench from './EditorComponents/CanvasTestBench.vue'
import { CODE_BLOCK_CONSTRAINTS, RICH_TEXT_CONSTRAINTS, TEST_BENCH_CONSTRAINTS } from './componentConstraints.ts'
import { normalizeConstraints, type ResizeConstraints } from './resizeConstraints.ts'

// highlight.js 内核与十余种语言语法包体积超过主包，所以仅在渲染代码块时按需加载
const EditableCodeBlock = defineAsyncComponent(() => import('./EditorComponents/EditableCodeBlock.vue'))

export interface RichTextConfig {
  content: NodeJSON | null
  autoHeight?: boolean
}

export interface CodeBlockConfig {
  code: string
  language: string
}

export interface TestBenchConfig {
  counter: number
  note: string
  showViewport?: boolean
}

export type WidgetConfig = RichTextConfig | CodeBlockConfig | TestBenchConfig
export type ComponentKey = 'RichTextEditor' | 'EditableCodeBlock' | 'CanvasTestBench'

export const DEFAULT_COMPONENT_KEY: ComponentKey = 'RichTextEditor'

// 块配置 ↔ 富文本内可插入节点的映射，具体组件在注册项里声明
export interface ComponentNodeMapping {
  name: string
  props: Record<string, unknown>
}

export interface ComponentController {
  saveConfig?: () => Partial<WidgetConfig>
  loadConfig?: (config: WidgetConfig) => void
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
  id: string
  component: ComponentKey
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

export interface AddableComponentMeta {
  key: ComponentKey
  label: string
  addId: string
  defaultConfig: () => WidgetConfig
  defaultSize: { w: number; h: number }
  widthChangableOf?: (config: WidgetConfig) => boolean
  heightChangableOf?: (config: WidgetConfig) => boolean
  // 可接收画布拖拽落点（如富文本）
  acceptsDrop?: boolean
  // 块配置转为富文本内可插入的节点（把块拖入富文本用）
  toNode?: (config: WidgetConfig) => ComponentNodeMapping | null
  // 富文本节点拖出成块（从富文本抽出块用）
  extractFromNode?: {
    nodeName: string
    toConfig: (props: Record<string, unknown>) => WidgetConfig
  }
}

export const componentMap = {
  RichTextEditor,
  EditableCodeBlock,
  CanvasTestBench,
}

export const ADDABLE_COMPONENTS: AddableComponentMeta[] = [
  {
    key: 'RichTextEditor',
    label: '富文本',
    addId: 'add-rich',
    defaultConfig: () => ({ content: null }),
    defaultSize: { w: 400, h: 300 },
    heightChangableOf: (config) => isRichTextHeightChangable(config as RichTextConfig),
    acceptsDrop: true,
  },
  {
    key: 'EditableCodeBlock',
    label: '代码块',
    addId: 'add-code',
    defaultConfig: () => ({
      code: '// 在此编写代码',
      language: 'javascript',
    }),
    defaultSize: { w: 400, h: 250 },
    toNode: (config) => {
      const codeConfig = config as CodeBlockConfig
      return { name: 'CodeBlock', props: { modelValue: codeConfig.code, language: codeConfig.language } }
    },
    extractFromNode: {
      nodeName: 'CodeBlock',
      toConfig: (props) => ({
        code: (props.modelValue as string | undefined) ?? '',
        language: (props.language as string | undefined) ?? 'javascript',
      }),
    },
  },
  {
    key: 'CanvasTestBench',
    label: '测试台',
    addId: 'add-test',
    defaultConfig: () => ({ counter: 0, note: '', showViewport: true }),
    defaultSize: { w: 420, h: 360 },
  },
]

export const componentMetaOf = (key: ComponentKey) =>
  ADDABLE_COMPONENTS.find((component) => component.key === key)

export const componentLabelOf = (key: ComponentKey) =>
  componentMetaOf(key)?.label ?? key

// 组件注册项声明自身尺寸可变性，画布据此判断联结该不该改它
export const heightChangableOf = (item: Pick<CanvasItem, 'component' | 'config'>): boolean =>
  componentMetaOf(item.component)?.heightChangableOf?.(item.config) ?? true

export const widthChangableOf = (item: Pick<CanvasItem, 'component' | 'config'>): boolean =>
  componentMetaOf(item.component)?.widthChangableOf?.(item.config) ?? true

const componentConstraints: Partial<Record<ComponentKey, ResizeConstraints>> = {
  RichTextEditor: RICH_TEXT_CONSTRAINTS,
  EditableCodeBlock: CODE_BLOCK_CONSTRAINTS,
  CanvasTestBench: TEST_BENCH_CONSTRAINTS,
}

const CANVAS_DEFAULT_CONSTRAINTS: Required<ResizeConstraints> = {
  minWidth: 100,
  maxWidth: null,
  minHeight: 100,
  maxHeight: null,
}

export const constraintsOf = (item: Pick<CanvasItem, 'component'>): Required<ResizeConstraints> => {
  const raw = componentConstraints[item.component]
  return raw ? normalizeConstraints(raw) : CANVAS_DEFAULT_CONSTRAINTS
}
