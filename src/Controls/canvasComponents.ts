import type { NodeJSON } from '@prosekit/core'
import { mdiCodeBraces, mdiFlaskOutline, mdiNoteText } from '@mdi/js'
import { defineAsyncComponent, type Component } from 'vue'

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
  uuid: string
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

export interface CanvasComponentDefinition<TConfig extends WidgetConfig = WidgetConfig> {
  key: string
  label: string
  icon: string
  addId: string
  component: Component
  constraints?: ResizeConstraints
  defaultConfig(): TConfig
  defaultSize: { w: number; h: number }
  widthChangableOf?(config: TConfig): boolean
  heightChangableOf?(config: TConfig): boolean
  // 可接收画布拖拽落点（如富文本）
  acceptsDrop?: boolean
  // 块配置转为富文本内可插入的节点（把块拖入富文本用）
  toNode?(config: TConfig): ComponentNodeMapping | null
  // 富文本节点拖出成块（从富文本抽出块用）
  extractFromNode?: {
    nodeName: string
    toConfig(props: Record<string, unknown>): TConfig
  }
}

// 泛型入口让每个注册项按自己的 config 类型校验回调，省掉调用处的断言
const defineCanvasComponent = <TConfig extends WidgetConfig>(definition: CanvasComponentDefinition<TConfig>) =>
  definition

export const CANVAS_COMPONENTS = [
  defineCanvasComponent<RichTextConfig>({
    key: 'RichTextEditor',
    label: '富文本',
    icon: mdiNoteText,
    addId: 'add-rich',
    component: RichTextEditor,
    constraints: RICH_TEXT_CONSTRAINTS,
    defaultConfig: () => ({ content: null }),
    defaultSize: { w: 400, h: 300 },
    heightChangableOf: isRichTextHeightChangable,
    acceptsDrop: true,
  }),
  defineCanvasComponent<CodeBlockConfig>({
    key: 'EditableCodeBlock',
    label: '代码块',
    icon: mdiCodeBraces,
    addId: 'add-code',
    component: EditableCodeBlock,
    constraints: CODE_BLOCK_CONSTRAINTS,
    defaultConfig: () => ({
      code: '// 在此编写代码',
      language: 'javascript',
    }),
    defaultSize: { w: 400, h: 250 },
    toNode: (config) => ({
      name: 'CodeBlock',
      props: { modelValue: config.code, language: config.language },
    }),
    extractFromNode: {
      nodeName: 'CodeBlock',
      toConfig: (props) => ({
        code: (props.modelValue as string | undefined) ?? '',
        language: (props.language as string | undefined) ?? 'javascript',
      }),
    },
  }),
  defineCanvasComponent<TestBenchConfig>({
    key: 'CanvasTestBench',
    label: '测试台',
    icon: mdiFlaskOutline,
    addId: 'add-test',
    component: CanvasTestBench,
    constraints: TEST_BENCH_CONSTRAINTS,
    defaultConfig: () => ({ counter: 0, note: '', showViewport: true }),
    defaultSize: { w: 420, h: 360 },
  }),
] as const

export type ComponentKey = (typeof CANVAS_COMPONENTS)[number]['key']

export const DEFAULT_COMPONENT_KEY: ComponentKey = 'RichTextEditor'

export const componentMap = Object.fromEntries(
  CANVAS_COMPONENTS.map((meta) => [meta.key, meta.component]),
) as Record<ComponentKey, Component>

export const componentMetaOf = (key: ComponentKey): CanvasComponentDefinition | undefined =>
  CANVAS_COMPONENTS.find((component) => component.key === key)

export const componentLabelOf = (key: ComponentKey) =>
  componentMetaOf(key)?.label ?? key

// 组件注册项声明自身尺寸可变性，画布据此判断联结该不该改它
export const heightChangableOf = (item: Pick<CanvasItem, 'component' | 'config'>): boolean =>
  componentMetaOf(item.component)?.heightChangableOf?.(item.config) ?? true

export const widthChangableOf = (item: Pick<CanvasItem, 'component' | 'config'>): boolean =>
  componentMetaOf(item.component)?.widthChangableOf?.(item.config) ?? true

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
