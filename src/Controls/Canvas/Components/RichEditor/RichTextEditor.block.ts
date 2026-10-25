import { mdiNoteText } from '@mdi/js'

import { defineBlock } from '../../Sdk/defineBlock.ts'
import type { RichTextConfig } from '../../Registry/canvasComponents.ts'
import { RICH_TEXT_CONSTRAINTS } from '../../Registry/componentConstraints.ts'
import RichTextEditor from './RichTextEditor.vue'

export default defineBlock<RichTextConfig>({
  key: 'RichTextEditor',
  title: '富文本',
  icon: mdiNoteText,
  addId: 'add-rich',
  order: 10,
  constraints: RICH_TEXT_CONSTRAINTS,
  defaultConfig: () => ({ content: null }),
  defaultSize: { w: 400, h: 300 },
  // 高度由内容驱动，联结传播不能改它
  heightChangableOf: (config) => config.autoHeight !== true,
  acceptsDrop: true,
  kind: 'raw',
  // 自带壳的块不能包异步组件：画布要直接拿到它的 expose（commands / saveConfig）
  rawComponent: RichTextEditor,
})
