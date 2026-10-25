<template>
  <div ref="rootRef" class="table-grid">
    <table class="grid">
      <tbody>
        <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
          <td v-for="(cell, colIndex) in row" :key="colIndex" :class="{ 'is-header': header && rowIndex === 0 }">
            <input :value="cell" :data-cell="`${rowIndex}-${colIndex}`" :readonly="readOnly"
              :placeholder="header && rowIndex === 0 ? '标题' : ''" @input="onCellInput(rowIndex, colIndex, $event)"
              @keydown="onCellKeydown($event, rowIndex, colIndex)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  rows: string[][]
  header: boolean
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update:rows', rows: string[][]): void }>()

const rootRef = ref<HTMLElement | null>(null)

// 每次输入都换新数组，与 config 的"嵌套结构换引用"约定一致
const onCellInput = (rowIndex: number, colIndex: number, event: Event) => {
  const next = props.rows.map((row) => [...row])
  if (!next[rowIndex]) return
  next[rowIndex][colIndex] = (event.target as HTMLInputElement).value
  emit('update:rows', next)
}

const focusCell = (rowIndex: number, colIndex: number) => {
  rootRef.value?.querySelector<HTMLInputElement>(`[data-cell="${rowIndex}-${colIndex}"]`)?.focus()
}

// Enter 沿列往下走，走到末行补一行，表格式录入不必动鼠标
const onCellKeydown = (event: KeyboardEvent, rowIndex: number, colIndex: number) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  if (rowIndex + 1 < props.rows.length) {
    focusCell(rowIndex + 1, colIndex)
    return
  }
  const width = props.rows[0]?.length ?? 0
  emit('update:rows', [...props.rows, Array.from({ length: width }, () => '')])
  void nextTick(() => focusCell(props.rows.length, colIndex))
}
</script>

<style scoped>
.table-grid {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 4px;
  box-sizing: border-box;
}

.grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.grid td {
  padding: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
}

.grid td.is-header {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.grid input {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: inherit;
  user-select: text;
}

.grid td.is-header input {
  font-weight: 600;
}

.grid input:focus {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
