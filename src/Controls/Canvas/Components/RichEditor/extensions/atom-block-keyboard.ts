import { defineKeyDownHandler } from '@prosekit/core'
import { NodeSelection, TextSelection } from 'prosekit/pm/state'
import type { EditorState, Transaction } from 'prosekit/pm/state'

// 方向键在原子块被选中时会让光标越到块另一侧，左右/上下都按这个约定
const BEFORE_KEYS = new Set(['ArrowLeft', 'ArrowUp'])
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
// GapCursor 由 prosekit 内部注册，取不到类型，只能按 Selection.jsonID 约定的 id 认
const GAP_CURSOR_ID = 'gapcursor'

// 原子块（插入组件、公式块）被选中时，任何文本输入都会按「替换选区」把它整块删掉
const selectedAtomBlock = (state: EditorState): NodeSelection | null => {
  const selection = state.selection
  if (!(selection instanceof NodeSelection)) return null
  return selection.node.isInline || selection.node.isTextblock ? null : selection
}

// 只有可打印字符会走「替换选区」，组合键与输入法组合都不该动光标
const isPrintableInput = (event: KeyboardEvent): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing

// 节点前后不是文本块时补空段落，否则光标落在块间隙、输入无处落笔
const caretBeside = (state: EditorState, selection: NodeSelection, isAfter: boolean): Transaction => {
  const pos = isAfter ? selection.from + selection.node.nodeSize : selection.from
  const tr = state.tr
  const touching = isAfter ? tr.doc.resolve(pos).nodeAfter : tr.doc.resolve(pos).nodeBefore
  let anchor = pos
  if (!touching?.isTextblock) {
    tr.insert(pos, tr.doc.type.schema.nodes.paragraph.create())
    anchor = pos + 1
  }
  return tr.setSelection(TextSelection.near(tr.doc.resolve(anchor), isAfter ? 1 : -1))
}

// 块间隙本身没有落笔位置，直接插文本会破坏结构，所以补一个空段落把光标接进去
const caretFromGap = (state: EditorState): Transaction => {
  const pos = state.selection.from
  const tr = state.tr.insert(pos, state.schema.nodes.paragraph.create())
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1))
}

// 原子块选中时打字会替换整块、块间隙没有落笔处，两种情况都要先把光标安顿好再交给默认输入
const prepareTyping = (state: EditorState): Transaction | null => {
  const selection = selectedAtomBlock(state)
  if (selection) return caretBeside(state, selection, true)
  return (state.selection as { jsonID?: string }).jsonID === GAP_CURSOR_ID ? caretFromGap(state) : null
}

// 打字前先把光标安顿到可落笔处，否则默认输入会替换掉原子块；方向键则把光标越过原子块
export const atomBlockKeyboard = defineKeyDownHandler((view, event) => {
  if (isPrintableInput(event)) {
    const moved = prepareTyping(view.state)
    if (moved) view.dispatch(moved)
    return false
  }
  const selection = selectedAtomBlock(view.state)
  if (!selection || !ARROW_KEYS.has(event.key)) return false
  view.dispatch(caretBeside(view.state, selection, !BEFORE_KEYS.has(event.key)))
  return true
})
