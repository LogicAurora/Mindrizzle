<template>
  <div class="file-card">
    <img v-if="isImage && previewUrl" class="file-preview" :src="previewUrl" :alt="name" />
    <div v-else-if="hasFile" class="file-summary">
      <v-icon :icon="fileIcon" size="44" class="text-medium-emphasis" />
      <div class="file-meta">
        <span class="file-name" :title="name">{{ name }}</span>
        <span class="file-caption">{{ formatBytes(size) }} : {{ mime || '未知类型' }}</span>
      </div>
    </div>
    <div v-else class="file-empty">
      <v-icon :icon="mdiPaperclip" size="40" class="text-medium-emphasis" />
      <span class="file-caption">还没有附件</span>
      <v-btn v-if="!readOnly" size="small" variant="tonal" color="primary" :prepend-icon="mdiFilePlus"
        @click="openPicker">
        选择文件
      </v-btn>
    </div>
    <div v-if="errorText" class="file-error">{{ errorText }}</div>
    <input ref="fileInputRef" type="file" class="d-none" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  mdiFileDocumentOutline,
  mdiFileImageOutline,
  mdiFileMusicOutline,
  mdiFileOutline,
  mdiFilePdfBox,
  mdiFilePlus,
  mdiFileVideoOutline,
  mdiPaperclip,
  mdiZipBoxOutline,
} from '@mdi/js'

import type { BlockFiles } from '../../Sdk/block.types.ts'
import { formatBytes } from '../../../../utils/formatBytes.ts'
import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'

const ERROR_VISIBLE_MS = 3200

const props = defineProps<{
  path: string
  name: string
  mime: string
  size: number
  readOnly: boolean
  // 没有可用目录（如旧嵌入节点缺 uuid）时为 null，只做展示
  files: BlockFiles | null
}>()

const emit = defineEmits<{
  (e: 'select', file: File): void
  (e: 'export'): void
  (e: 'remove'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const previewUrl = ref('')
const errorText = ref('')
let previewToken = 0
let errorTimer = 0

const hasFile = computed(() => props.path !== '')
const isImage = computed(() => props.mime.startsWith('image/'))

const fileIcon = computed(() => {
  const mime = props.mime
  if (mime.startsWith('image/')) return mdiFileImageOutline
  if (mime === 'application/pdf') return mdiFilePdfBox
  if (mime.startsWith('audio/')) return mdiFileMusicOutline
  if (mime.startsWith('video/')) return mdiFileVideoOutline
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return mdiZipBoxOutline
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return mdiFileDocumentOutline
  return mdiFileOutline
})

const showError = (message: string) => {
  errorText.value = message
  window.clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => { errorText.value = '' }, ERROR_VISIBLE_MS)
}

const revokePreview = () => {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

// 只有图片需要读内容做预览，其它类型只显示元信息
const loadPreview = async () => {
  const token = ++previewToken
  if (!isImage.value || !props.path || !props.files) {
    revokePreview()
    return
  }
  try {
    const bytes = await props.files.readBinary(props.path)
    if (token !== previewToken) return
    revokePreview()
    previewUrl.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: props.mime }))
  } catch (cause) {
    if (token === previewToken) showError(`读取附件失败：${getErrorMessage(cause)}`)
  }
}

watch([() => props.path, () => props.mime, () => props.files], () => { void loadPreview() }, { immediate: true })

onBeforeUnmount(() => {
  previewToken += 1
  window.clearTimeout(errorTimer)
  revokePreview()
})

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

defineExpose({ openPicker, showError })
</script>

<style scoped>
.file-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.03);
  user-select: text;
}

.file-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.file-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  padding: 16px;
}

.file-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.file-caption {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.file-error {
  position: absolute;
  inset: auto 8px 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}
</style>
