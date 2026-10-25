<template>
  <div class="image-card">
    <div v-if="imageUrl && fit === 'tile'" class="image-tile" :style="tileStyle" role="img" :aria-label="alt" />
    <v-img v-else-if="imageUrl" :src="imageUrl" :alt="alt" :cover="fit === 'cover'"
      :class="['image-preview', { 'fit-fill': fit === 'fill' }]" />
    <div v-else class="image-empty">
      <v-progress-circular v-if="isLoading" indeterminate size="28" color="primary" />
      <template v-else>
        <v-icon :icon="mdiImageOutline" size="40" class="text-medium-emphasis" />
        <span class="text-caption text-medium-emphasis">{{ loadFailed ? '图片读取失败' : '还没有图片' }}</span>
        <v-btn v-if="!readOnly" :prepend-icon="mdiImagePlus" size="small" variant="tonal" color="primary"
          @click="openPicker">
          选择图片
        </v-btn>
      </template>
    </div>
    <div v-if="errorText" class="image-error">{{ errorText }}</div>
    <input ref="fileInputRef" type="file" accept="image/*" class="d-none" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { mdiImageOutline, mdiImagePlus } from '@mdi/js'

import type { BlockFiles } from '../../Sdk/block.types.ts'
import type { ImageFit } from '../../Registry/canvasComponents.ts'
import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'
import { MAX_IMAGE_BYTES } from './imageConfig.ts'

const ERROR_VISIBLE_MS = 3200

const props = defineProps<{
  path: string
  mime: string
  alt: string
  fit: ImageFit
  readOnly: boolean
  files: BlockFiles | null
}>()

const emit = defineEmits<{
  (e: 'select', file: File): void
  (e: 'loaded'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const imageUrl = ref('')
const isLoading = ref(false)
const loadFailed = ref(false)
const errorText = ref('')
let loadToken = 0
let errorTimer = 0

const revokeImageUrl = () => {
  if (!imageUrl.value) return
  URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

const showError = (message: string) => {
  errorText.value = message
  window.clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => { errorText.value = '' }, ERROR_VISIBLE_MS)
}

const loadImage = async () => {
  const path = props.path
  const token = ++loadToken
  loadFailed.value = false
  if (!path || !props.files) {
    isLoading.value = false
    revokeImageUrl()
    return
  }
  isLoading.value = true
  try {
    const bytes = await props.files.readBinary(path)
    // 快速换图时旧请求可能后返回，用令牌挡掉过期结果
    if (token !== loadToken) return
    revokeImageUrl()
    imageUrl.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: props.mime || 'application/octet-stream' }))
    emit('loaded')
  } catch (cause) {
    if (token !== loadToken) return
    loadFailed.value = true
    showError(`读取图片失败：${getErrorMessage(cause)}`)
  } finally {
    if (token === loadToken) isLoading.value = false
  }
}

watch([() => props.path, () => props.mime, () => props.files], () => { void loadImage() }, { immediate: true })

onBeforeUnmount(() => {
  loadToken += 1
  window.clearTimeout(errorTimer)
  revokeImageUrl()
})

const openPicker = () => {
  if (!props.readOnly) fileInputRef.value?.click()
}

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value 才能重复选择同一个文件
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showError('只能选择图片文件')
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showError('图片超过 64 MiB 上限')
    return
  }
  emit('select', file)
}

const naturalSize = () => new Promise<{ w: number; h: number } | null>((resolve) => {
  const url = imageUrl.value
  if (!url) {
    resolve(null)
    return
  }
  const probe = new Image()
  probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
  probe.onerror = () => resolve(null)
  probe.src = url
})

const tileStyle = computed(() => (imageUrl.value ? { backgroundImage: `url("${imageUrl.value}")` } : {}))

defineExpose({ openPicker, showError, naturalSize })
</script>

<style scoped>
.image-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 100%;
  height: 100%;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.image-preview {
  width: 100%;
  height: 100%;
}

.image-preview :deep(img) {
  user-select: none;
}

.image-card .fit-fill :deep(img) {
  object-fit: fill;
}

.image-tile {
  width: 100%;
  height: 100%;
  background-repeat: repeat;
  background-position: 0 0;
}

.image-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.image-error {
  position: absolute;
  inset: auto 8px 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}
</style>
