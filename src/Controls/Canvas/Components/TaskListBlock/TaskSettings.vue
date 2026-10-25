<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-text-field :model-value="title" label="清单标题" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="(value) => emitUpdate({ title: String(value ?? '') })" />
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 px-3">
      <v-btn size="small" variant="tonal" :disabled="readOnly" @click="setAllDone(true)">全部完成</v-btn>
      <v-btn size="small" variant="tonal" :disabled="readOnly" @click="setAllDone(false)">全部未完成</v-btn>
      <v-btn size="small" variant="text" color="error" :disabled="readOnly" @click="clearDone">清除已完成</v-btn>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import type { TaskItem } from '../../Registry/canvasComponents.ts'

const props = defineProps<{
  title: string
  tasks: TaskItem[]
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update', patch: Record<string, unknown>): void }>()

const emitUpdate = (patch: Record<string, unknown>) => emit('update', patch)
const setAllDone = (done: boolean) => emitUpdate({ tasks: props.tasks.map((task) => ({ ...task, done })) })
const clearDone = () => emitUpdate({ tasks: props.tasks.filter((task) => !task.done) })
</script>
