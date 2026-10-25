<template>
  <BlockShell>
    <TableGrid :rows="rows" :header="header" :read-only="ctx.readOnly" @update:rows="onRowsUpdate" />

    <template #settings>
      <TableSettings :rows="rows" :header="header" :read-only="ctx.readOnly" @update="onSettingsUpdate" />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TableBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'
import TableGrid from './TableBlock/TableGrid.vue'
import TableSettings from './TableBlock/TableSettings.vue'
import { normalizeTableRows } from './TableBlock/tableRows.ts'

const ctx = useBlockContext<TableBlockConfig>()

const rows = ref<string[][]>(normalizeTableRows(ctx.config.rows))
const header = computed(() => ctx.config.header !== false)

// 载入新文档会整体换 config，自己 commit 时写的是同一个数组引用，据此避免回灌覆盖输入
watch(
  () => ctx.config.rows,
  (next) => {
    if (next !== rows.value) rows.value = normalizeTableRows(next)
  },
)

const commit = () => {
  ctx.setConfig({ rows: rows.value })
}

const onRowsUpdate = (next: string[][]) => {
  rows.value = next
  commit()
}

// 设置面板改的是同一份 rows，先同步本地再写回 config
const onSettingsUpdate = (patch: Record<string, unknown>) => {
  if (Array.isArray(patch.rows)) rows.value = patch.rows as string[][]
  ctx.setConfig(patch)
}
</script>
