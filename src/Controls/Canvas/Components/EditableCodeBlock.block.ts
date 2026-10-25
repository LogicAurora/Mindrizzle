import { mdiCodeBraces } from '@mdi/js'

import CodeBlockEmbed from './CodeBlock/CodeBlockEmbed.vue'
import { defineBlock } from '../Sdk/defineBlock.ts'
import type { CodeBlockConfig } from '../Registry/canvasComponents.ts'
import { CODE_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts'

export default defineBlock<CodeBlockConfig>({
  key: 'EditableCodeBlock',
  title: '代码块',
  icon: mdiCodeBraces,
  addId: 'add-code',
  order: 20,
  constraints: CODE_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({
    code: '// 在此编写代码',
    language: 'javascript',
  }),
  defaultSize: { w: 400, h: 250 },
  embed: {
    nodeName: 'CodeBlock',
    component: CodeBlockEmbed,
    toProps: (config) => ({ modelValue: config.code, language: config.language }),
    fromProps: (props) => ({
      code: (props.modelValue as string | undefined) ?? '',
      language: (props.language as string | undefined) ?? 'javascript',
    }),
  },
})
