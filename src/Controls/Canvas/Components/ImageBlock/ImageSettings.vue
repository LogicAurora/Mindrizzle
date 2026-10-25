<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-select :model-value="fit" :items="FIT_OPTIONS" item-title="title" item-value="value" label="显示方式"
        density="compact" variant="outlined" hide-details :disabled="readOnly"
        :menu-props="{ zIndex: Z_LAYER.settingsDropdown }"
        @update:model-value="(value) => emitUpdate({ fit: toImageFit(value) })" />
    </v-list-item>
    <v-list-item v-if="showAutoSize" class="px-3">
      <v-switch :model-value="autoSize" color="primary" label="自动大小" hint="块尺寸等于图片像素"
        persistent-hint hide-details :disabled="readOnly"
        @update:model-value="(value) => emitUpdate({ autoSize: value === true })" />
    </v-list-item>
    <v-list-item class="px-3">
      <v-text-field :model-value="alt" label="图片描述" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="(value) => emitUpdate({ alt: String(value ?? '') })" />
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 justify-end px-3">
      <v-btn size="small" variant="tonal" :prepend-icon="mdiImageRefresh" :disabled="readOnly" @click="openPicker">
        更换
      </v-btn>
      <v-btn size="small" variant="text" color="error" :disabled="readOnly || !path" @click="emit('remove')">
        移除
      </v-btn>
    </v-list-item>
    <input ref="fileInputRef" type="file" accept="image/*" class="d-none" @change="onFileChange" />
  </v-list>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { mdiImageRefresh } from '@mdi/js'

import { Z_LAYER } from '../../Core/zIndex.ts'
import type { ImageFit } from '../../Registry/canvasComponents.ts'
import { toImageFit } from './imageConfig.ts'

const FIT_OPTIONS = [
  { title: '适应', value: 'contain' },
  { title: '拉伸', value: 'fill' },
  { title: '覆盖', value: 'cover' },
  { title: '平铺', value: 'tile' },
]

const props = defineProps<{
  alt: string
  fit: ImageFit
  path: string
  readOnly: boolean
  autoSize?: boolean
  // 自动大小只对画布块有意义（嵌入态由节点尺寸决定）
  showAutoSize?: boolean
}>()

const emit = defineEmits<{
  (e: 'update', patch: Record<string, unknown>): void
  (e: 'select', file: File): void
  (e: 'remove'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const emitUpdate = (patch: Record<string, unknown>) => emit('update', patch)

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
