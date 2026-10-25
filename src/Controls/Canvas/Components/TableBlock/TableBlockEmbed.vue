<template>
  <TableGrid :rows="rows" :header="header" :read-only="readOnly === true" @update:rows="onRowsUpdate" />
  <Teleport v-if="settingsHost" :to="settingsHost">
    <TableSettings :rows="rows" :header="header" :read-only="readOnly === true" @update="onSettingsUpdate" />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false })

import { EMBED_SETTINGS_HOST_KEY } from '../../Sdk/embedSettingsHost.ts'
import TableGrid from './TableGrid.vue'
import TableSettings from './TableSettings.vue'
import { normalizeTableRows } from './tableRows.ts'

const props = defineProps<{
  rows?: unknown
  header?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{ (e: 'update-props', patch: Record<string, unknown>): void }>()

const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null))
const rows = ref<string[][]>(normalizeTableRows(props.rows))
const header = computed(() => props.header !== false)

// 节点 attrs 换了（撤销/重做）就回灌，自己写回的是同一引用，据此避免覆盖输入
watch(
  () => props.rows,
  (next) => {
    if (next !== rows.value) rows.value = normalizeTableRows(next)
  },
)

const onRowsUpdate = (next: string[][]) => {
  rows.value = next
  emit('update-props', { rows: next })
}

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  if (Array.isArray(patch.rows)) rows.value = patch.rows as string[][]
  emit('update-props', patch)
}
</script>
