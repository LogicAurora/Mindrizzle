import {
  union,
  createEditor,
  defineBaseCommands,
  defineBaseKeymap,
  defineCommands,
  defineHistory,
} from '@prosekit/core'
import { defineDoc } from '@prosekit/extensions/doc'
import { defineList } from 'prosekit/extensions/list'
import { defineParagraph } from '@prosekit/extensions/paragraph'
import { defineText } from '@prosekit/extensions/text'
import { defineMath } from 'prosekit/extensions/math'
import { defineHeading } from 'prosekit/extensions/heading'
import { renderKaTeXMathBlock, renderKaTeXMathInline } from './extensions/kateX.ts'
import { definePlaceholder } from '@prosekit/extensions/placeholder'
import {
  bold,
  italic,
  underline,
  strikethrough,
  textColor,
  backgroundColor,
  highlight,
  fontFamily,
  boldKeymap,
  italicKeymap,
  underlineKeymap,
  strikethroughKeymap,
  highlightKeymap,
} from './extensions/formatting.ts'
import {
  EMBED_DEFAULT_HEIGHT,
  EMBED_DEFAULT_WIDTH,
  vueComponentNode,
  vueComponentNodeView,
} from './extensions/vue-component.ts'
import { atomBlockKeyboard } from './extensions/atom-block-keyboard.ts'
import { generateBlockUuid } from '../../../../utils/blockUuid.ts'
import { defineBlockquote } from 'prosekit/extensions/blockquote'
import { defineSubscript } from 'prosekit/extensions/subscript'
import { defineSuperscript } from 'prosekit/extensions/superscript'
import { defineGapCursor } from 'prosekit/extensions/gap-cursor'
import { Fragment, Slice } from 'prosekit/pm/model'
import type { Node as ProseMirrorNode, Schema } from 'prosekit/pm/model'
import { TextSelection } from 'prosekit/pm/state'
import type { Transaction } from 'prosekit/pm/state'
import { dropPoint } from 'prosekit/pm/transform'

interface EmbedInsertion {
  schema: Schema
  componentName: string
  props: Record<string, any>
  uuid?: string
  containerWidth: number
}

// uuid 可选：从画布块拖入时沿用源块 uuid，附件类块的组件数据目录才能直接复用
const createEmbedNode = (options: EmbedInsertion): ProseMirrorNode | null => {
  const { schema, componentName, props, uuid, containerWidth } = options
  return schema.nodes.vueComponent?.create({
    componentName,
    props,
    width: Math.min(EMBED_DEFAULT_WIDTH, containerWidth || EMBED_DEFAULT_WIDTH),
    height: EMBED_DEFAULT_HEIGHT,
    uuid: uuid ?? generateBlockUuid(),
  }) ?? null
}

// 组件是原子块，光标停在它身上时下一次输入会把它整体替换掉，所以统一把落笔点放进节点后的文本块
const placeCaretAfterEmbed = (tr: Transaction, pos: number, nodeSize: number): void => {
  const after = pos + nodeSize
  const $after = tr.doc.resolve(after)
  if (!$after.nodeAfter?.isTextblock) tr.insert(after, tr.doc.type.schema.nodes.paragraph.create())
  tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1))
}

// 父组件统一经 editor.commands 调用，所以在此注册自定义命令；
// 标题切换复用 defineHeading() 内置的 toggleHeading，避免同名命令被合并成交叉类型
const customCommands = defineCommands({
  insertVueComponent(componentName: string, props: Record<string, any> = {}, uuid?: string) {
    return (state, dispatch, view) => {
      if (!view) return false
      const node = createEmbedNode({ schema: state.schema, componentName, props, uuid, containerWidth: view.dom.clientWidth })
      if (!node) return false
      if (!dispatch) return true
      // 光标落在段落内时块级节点插不进去，所以由 dropPoint 找最近的合法块间隙
      const pos = dropPoint(state.doc, state.selection.anchor, new Slice(Fragment.from(node), 0, 0))
      if (pos == null) return false
      const tr = state.tr.insert(pos, node)
      placeCaretAfterEmbed(tr, pos, node.nodeSize)
      dispatch(tr.scrollIntoView())
      return true
    }
  },
  // 落点由指示线给出，按指定位置插入而非当前选区
  insertVueComponentAt(pos: number, componentName: string, props: Record<string, any> = {}, uuid?: string) {
    return (state, dispatch, view) => {
      if (!view) return false
      // 落点来自画布帧缓存可能越界，所以直接失败让调用方回退，避免 tr.insert 抛错
      if (pos < 0 || pos > state.doc.content.size) return false
      const node = createEmbedNode({ schema: state.schema, componentName, props, uuid, containerWidth: view.dom.clientWidth })
      if (!node) return false
      if (!dispatch) return true
      const tr = state.tr.insert(pos, node)
      placeCaretAfterEmbed(tr, pos, node.nodeSize)
      dispatch(tr.scrollIntoView())
      return true
    }
  },
  insertMathInline(latex: string) {
    return (state, dispatch) => {
      const node = state.schema.nodes.mathInline?.create({}, state.schema.text(latex))
      if (!node) return false
      const tr = state.tr.replaceSelectionWith(node)
      if (dispatch) dispatch(tr)
      return true
    }
  },
  insertMathBlock(latex: string) {
    return (state, dispatch) => {
      const node = state.schema.nodes.mathBlock?.create({}, state.schema.text(latex))
      if (!node) return false
      const tr = state.tr.replaceSelectionWith(node)
      if (dispatch) dispatch(tr)
      return true
    }
  },
})

export function defineExtension() {
  return union(
    defineBaseCommands(),
    defineDoc(),
    defineParagraph(),
    defineText(),
    defineBaseKeymap(),
    defineHistory(),
    defineHeading(),
    definePlaceholder({ placeholder: '写点什么吧' }),
    defineList(),
    defineBlockquote(),
    defineSubscript(),
    defineSuperscript(),
    defineGapCursor(),
    defineMath({ renderMathBlock: renderKaTeXMathBlock, renderMathInline: renderKaTeXMathInline }),
    bold,
    italic,
    underline,
    strikethrough,
    textColor,
    backgroundColor,
    highlight,
    fontFamily,
    boldKeymap,
    italicKeymap,
    underlineKeymap,
    strikethroughKeymap,
    highlightKeymap,
    vueComponentNode,
    vueComponentNodeView,
    atomBlockKeyboard,
    customCommands,
  )
}
export type EditorExtension = ReturnType<typeof defineExtension>
// 父组件统一经 editor.commands 命令链调用（含自定义与各扩展命令）且要 IDE 补全，
// 直接以 createEditor 实例的 commands 推导精确命令类型，而非手写宽泛索引签名
export type EditorCommands = ReturnType<typeof createEditor<EditorExtension>>['commands']