<template>
  <BlockShell>
    <CodeBlockEditor :code="config.code" :language="config.language" :read-only="ctx.readOnly"
      @update:code="onCodeChange" @update:language="onLanguageChange" />
  </BlockShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { CodeBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'

import CodeBlockEditor from './CodeBlock/CodeBlockEditor.vue'

const ctx = useBlockContext<CodeBlockConfig>()
const config = computed(() => ctx.config)

// 逐字符写入只换 config，不触发结构性几何刷新
const onCodeChange = (code: string) => {
  ctx.setConfig({ code })
}

const onLanguageChange = (language: string) => {
  ctx.setConfig({ language })
}
</script>
