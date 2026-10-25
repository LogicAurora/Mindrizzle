<template>
  <v-list density="compact">
    <v-list-item v-if="name" class="px-3">
      <v-list-item-title class="text-body-2 text-truncate" :title="name">{{ name }}</v-list-item-title>
      <v-list-item-subtitle class="text-caption">{{ formatBytes(size) }}</v-list-item-subtitle>
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 justify-end px-3">
      <v-btn size="small" variant="tonal" :prepend-icon="mdiFileReplace" :disabled="readOnly" @click="openPicker">
        {{ name ? '更换' : '选择' }}
      </v-btn>
      <v-btn size="small" variant="tonal" :prepend-icon="mdiDownload" :disabled="!path" @click="emit('export')">
        导出
      </v-btn>
      <v-btn size="small" variant="text" color="error" :disabled="readOnly || !path" @click="emit('remove')">
        移除
      </v-btn>
    </v-list-item>
    <input ref="fileInputRef" type="file" class="d-none" @change="onFileChange" />
  </v-list>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { mdiDownload, mdiFileReplace } from '@mdi/js'

import { formatBytes } from '../../../../utils/formatBytes.ts'

const props = defineProps<{
  name: string
  size: number
  path: string
  readOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'select', file: File): void
  (e: 'export'): void
  (e: 'remove'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

const openPicker = () => {
  if (!props.readOnly) fileInputRef.value?.click()
}

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value 才能重复选择同一个文件
  input.value = ''
  if (file) emit('select', file)
}
</script>
