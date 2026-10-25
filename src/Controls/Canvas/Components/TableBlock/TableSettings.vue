<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-switch :model-value="header" color="primary" label="首行作为表头" hide-details :disabled="readOnly"
        @update:model-value="(value) => emitUpdate({ header: value === true })" />
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 px-3">
      <v-btn size="small" variant="tonal" :disabled="readOnly || rows.length >= MAX_TABLE_ROWS" @click="addRow">
        加行
      </v-btn>
      <v-btn size="small" variant="tonal" :disabled="readOnly || columnCount >= MAX_TABLE_COLUMNS" @click="addColumn">
        加列
      </v-btn>
      <v-btn size="small" variant="tonal" :disabled="readOnly || rows.length <= MIN_TABLE_ROWS" @click="removeRow">
        删行
      </v-btn>
      <v-btn size="small" variant="tonal" :disabled="readOnly || columnCount <= MIN_TABLE_COLUMNS"
        @click="removeColumn">
        删列
      </v-btn>
    </v-list-item>
    <v-list-item class="d-flex justify-end px-3">
      <v-btn size="small" variant="text" color="error" :disabled="readOnly" @click="clearTable">清空内容</v-btn>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import {
  columnCountOf,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MIN_TABLE_COLUMNS,
  MIN_TABLE_ROWS,
} from './tableRows.ts'

const props = defineProps<{
  rows: string[][]
  header: boolean
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update', patch: Record<string, unknown>): void }>()

const columnCount = computed(() => columnCountOf(props.rows))
const emitUpdate = (patch: Record<string, unknown>) => emit('update', patch)

const addRow = () => emitUpdate({ rows: [...props.rows, Array.from({ length: columnCount.value }, () => '')] })
const addColumn = () => emitUpdate({ rows: props.rows.map((row) => [...row, '']) })
const removeRow = () => emitUpdate({ rows: props.rows.slice(0, -1) })
const removeColumn = () => emitUpdate({ rows: props.rows.map((row) => row.slice(0, -1)) })
const clearTable = () => emitUpdate({ rows: props.rows.map((row) => row.map(() => '')) })
</script>
