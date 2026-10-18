<template>
  <MdrCanvasComponentBase ref="baseRef" v-bind="props.base" :icon="mdiImageOutline" :title="IMAGE_BLOCK_LABEL"
    :width-changable="!autoSize && props.base.compact !== true" :height-changable="!autoSize">
    <div v-if="!virtualized" class="image-block inner-component">
      <div v-if="imageUrl && fit === 'tile'" class="image-tile" :style="tileStyle" role="img" :aria-label="imageAlt" />
      <v-img v-else-if="imageUrl" :src="imageUrl" :alt="imageAlt" :cover="fit === 'cover'"
        :class="['image-preview', { 'fit-fill': fit === 'fill' }]" />
      <div v-else class="image-empty">
        <v-progress-circular v-if="isLoading" indeterminate size="28" color="primary" />
        <template v-else>
          <v-icon :icon="mdiImageOutline" size="40" class="text-medium-emphasis" />
          <span class="text-caption text-medium-emphasis">{{ loadFailed ? '图片读取失败' : '还没有图片' }}</span>
          <v-btn v-if="canEdit" :prepend-icon="mdiImagePlus" size="small" variant="tonal" color="primary"
            @click="openPicker">
            选择图片
          </v-btn>
        </template>
      </div>
      <v-snackbar v-model="snackbar" :timeout="3000" color="error" location="top">
        {{ snackbarText }}
      </v-snackbar>
    </div>
    <div v-else class="virtual-snapshot inner-component" v-html="snapshot" />
    <input ref="fileInputRef" type="file" accept="image/*" class="d-none" @change="onFileChange" />

    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-select :model-value="fit" :items="FIT_OPTIONS" item-title="title" item-value="value" label="显示方式"
            density="compact" variant="outlined" hide-details :disabled="!canEdit"
            :menu-props="{ zIndex: Z_LAYER.settingsDropdown }" @update:model-value="onFitChange" />
        </v-list-item>
        <v-list-item>
          <v-switch :model-value="autoSize" color="primary" label="自动大小" hint="块尺寸等于图片像素"
            persistent-hint hide-details :disabled="!canEdit"
            @update:model-value="onAutoSizeToggle" />
        </v-list-item>
        <v-list-item>
          <v-text-field :model-value="imageAlt" label="图片描述" density="compact" variant="outlined" hide-details
            :readonly="!canEdit" @update:model-value="onAltInput" />
        </v-list-item>
        <v-list-item class="d-flex justify-end ga-2">
          <v-btn size="small" variant="tonal" :prepend-icon="mdiImageRefresh" :disabled="!canEdit" @click="openPicker">
            更换
          </v-btn>
          <v-btn size="small" variant="text" color="error" :disabled="!canEdit || !storedPath" @click="removeImage">
            移除
          </v-btn>
        </v-list-item>
      </v-list>
    </template>
  </MdrCanvasComponentBase>
</template>

<script lang="ts">
export { IMAGE_BLOCK_CONSTRAINTS as resizeConstraints } from '../Registry/componentConstraints.ts'

export const IMAGE_BLOCK_LABEL = '图片'
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { error as logError } from '@tauri-apps/plugin-log'
import { mdiImageOutline, mdiImagePlus, mdiImageRefresh } from '@mdi/js'

import MdrCanvasComponentBase from '../Core/MdrCanvasComponentBase.vue'
import type { MdrCanvasComponentContentProps } from '../Core/MdrCanvasComponentBase.types.ts'
import type { BlockComponentController } from '../Core/canvasComponentControllers.ts'
import { Z_LAYER } from '../Core/zIndex.ts'
import type { ImageBlockConfig, ImageFit } from '../Registry/canvasComponents.ts'
import { ComponentDataStore } from '../../../utils/componentDataStore.ts'
import { getErrorMessage } from '../../../utils/getErrorMessage.ts'

// 与 Rust 侧 COMPONENT_FILE_MAX_BYTES 一致，前端先拦一次省掉整包重打的失败开销
const MAX_IMAGE_BYTES = 64 * 1024 * 1024
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
}
const IMAGE_EXTENSION_FALLBACK = 'bin'
const IMAGE_FITS: ImageFit[] = ['contain', 'cover', 'fill', 'tile']
const FIT_OPTIONS = [
  { title: '适应', value: 'contain' },
  { title: '拉伸', value: 'fill' },
  { title: '覆盖', value: 'cover' },
  { title: '平铺', value: 'tile' },
]

// 旧配置没有 fit/autoSize，回退到适应与原尺寸
const toFit = (value: unknown): ImageFit =>
  IMAGE_FITS.includes(value as ImageFit) ? value as ImageFit : 'contain'

const props = defineProps<MdrCanvasComponentContentProps<ImageBlockConfig> & {
  virtualized?: boolean
  snapshot?: string
}>()

const baseRef = ref<{ controller: BlockComponentController } | null>(null)
const storedPath = ref(props.config?.path ?? '')
const imageMime = ref(props.config?.mime ?? '')
const imageAlt = ref(props.config?.alt ?? '')
const fit = ref<ImageFit>(toFit(props.config?.fit))
const autoSize = ref(props.config?.autoSize === true)
const canEdit = computed(() => props.base.readOnly !== true)
// 构造时捕获当前笔记名，组件被虚拟化重建后也不会读到别的笔记
const componentData = new ComponentDataStore()

const imageUrl = ref('')
const isLoading = ref(false)
const loadFailed = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
// 同格式换图时路径不变，只靠 path 侦测不到覆盖写入，所以再加一个加载版本号
const imageVersion = ref(0)
let loadToken = 0

const revokeImageUrl = () => {
  if (!imageUrl.value) return
  URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

const logFailure = (message: string, cause: unknown) => {
  if (isTauri()) void logError(`${message}：${getErrorMessage(cause)}`)
}

const showError = (message: string, cause: unknown) => {
  logFailure(message, cause)
  snackbarText.value = `${message}：${getErrorMessage(cause)}`
  snackbar.value = true
}

const naturalSizeOf = (url: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const probe = new Image()
  probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight })
  probe.onerror = () => reject(new Error('图片解码失败'))
  probe.src = url
})

const applyNaturalSize = async () => {
  const url = imageUrl.value
  if (!autoSize.value || !url) return
  const token = loadToken
  try {
    const size = await naturalSizeOf(url)
    if (token !== loadToken || !autoSize.value || size.width <= 0 || size.height <= 0) return
    baseRef.value?.controller.resizeTo(size)
  } catch (cause) {
    logFailure('读取图片尺寸失败', cause)
  }
}

const loadImage = async () => {
  const path = storedPath.value
  const token = ++loadToken
  loadFailed.value = false
  if (!path) {
    isLoading.value = false
    revokeImageUrl()
    return
  }
  isLoading.value = true
  try {
    const bytes = await componentData.readFile(componentData.urlOf(props.base.uuid, path))
    // 快速换图时旧请求可能后返回，用令牌挡掉过期结果
    if (token !== loadToken) return
    revokeImageUrl()
    imageUrl.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime.value || 'application/octet-stream' }))
    if (autoSize.value) void applyNaturalSize()
  } catch (cause) {
    if (token !== loadToken) return
    loadFailed.value = true
    logFailure('读取图片失败', cause)
  } finally {
    if (token === loadToken) isLoading.value = false
  }
}

watch([storedPath, imageVersion], () => { void loadImage() }, { immediate: true })

// 画布只会在重建时换 config，外部换图时同步回本地状态
watch(() => props.config?.path, (path) => {
  storedPath.value = path ?? ''
})
watch(() => props.config?.mime, (mime) => {
  imageMime.value = mime ?? ''
})
watch(() => props.config?.alt, (alt) => {
  imageAlt.value = alt ?? ''
})
watch(() => props.config?.fit, (value) => {
  fit.value = toFit(value)
})
watch(() => props.config?.autoSize, (value) => {
  autoSize.value = value === true
})

onBeforeUnmount(() => {
  loadToken += 1
  revokeImageUrl()
})

const openPicker = () => {
  if (canEdit.value) fileInputRef.value?.click()
}

const extensionOf = (mime: string) => EXTENSION_BY_MIME[mime] ?? IMAGE_EXTENSION_FALLBACK

const baseNameOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

const deleteStaleFile = async (previousPath: string, nextPath: string) => {
  if (!previousPath || previousPath === nextPath) return
  try {
    await componentData.deleteFile(componentData.urlOf(props.base.uuid, previousPath))
  } catch (cause) {
    // 旧文件残留不影响新图显示，只记日志
    logFailure('清理旧图片失败', cause)
  }
}

const uploadFile = async (file: File) => {
  const nextPath = `image.${extensionOf(file.type)}`
  isLoading.value = true
  try {
    const url = componentData.urlOf(props.base.uuid, nextPath)
    await componentData.writeFile(url, new Uint8Array(await file.arrayBuffer()))
    await deleteStaleFile(storedPath.value, nextPath)
    storedPath.value = nextPath
    imageMime.value = file.type
    imageVersion.value += 1
    if (!imageAlt.value) imageAlt.value = baseNameOf(file.name)
    props.base.handlers.writeConfig({ path: storedPath.value, mime: imageMime.value, alt: imageAlt.value })
  } catch (cause) {
    showError('保存图片失败', cause)
  } finally {
    isLoading.value = false
  }
}

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value 才能重复选择同一个文件
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    snackbarText.value = '只能选择图片文件'
    snackbar.value = true
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    snackbarText.value = '图片超过 64 MiB 上限'
    snackbar.value = true
    return
  }
  await uploadFile(file)
}

const tileStyle = computed(() => (imageUrl.value ? { backgroundImage: `url("${imageUrl.value}")` } : {}))

const onFitChange = (value: unknown) => {
  fit.value = toFit(value)
  props.base.handlers.writeConfig({ fit: fit.value })
}

const onAutoSizeToggle = (value: unknown) => {
  autoSize.value = value === true
  props.base.handlers.updateConfig({ autoSize: autoSize.value })
  if (autoSize.value) void applyNaturalSize()
}

const onAltInput = (value: unknown) => {
  imageAlt.value = String(value ?? '')
  props.base.handlers.writeConfig({ alt: imageAlt.value })
}

const removeImage = async () => {
  const path = storedPath.value
  if (!path) return
  storedPath.value = ''
  imageMime.value = ''
  props.base.handlers.writeConfig({ path: '', mime: '', alt: imageAlt.value })
  try {
    await componentData.deleteFile(componentData.urlOf(props.base.uuid, path))
  } catch (cause) {
    logFailure('删除图片失败', cause)
  }
}

defineExpose({
  saveConfig() {
    return {
      path: storedPath.value,
      mime: imageMime.value,
      alt: imageAlt.value,
      fit: fit.value,
      autoSize: autoSize.value,
    }
  },
})
</script>

<style scoped>
/* 快照是克隆的组件 DOM，用 display:contents 让它像原来一样直接充当 .content-area 的 flex 子项 */
.virtual-snapshot {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会把指针事件吞进死 DOM，所以整棵子树穿透 */
.virtual-snapshot :deep(*) {
  pointer-events: none !important;
}

.image-block {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.image-preview {
  width: 100%;
  height: 100%;
}

.image-preview :deep(img) {
  user-select: none;
}

.image-block .fit-fill :deep(img) {
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
</style>
