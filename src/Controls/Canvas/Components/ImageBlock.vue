<template>
  <BlockShell>
    <ImageCardView ref="cardRef" :path="storedPath" :mime="imageMime" :alt="imageAlt" :fit="fit"
      :read-only="ctx.readOnly" :files="ctx.files" @select="uploadFile" @loaded="onImageLoaded" />

    <template #settings>
      <ImageSettings :alt="imageAlt" :fit="fit" :path="storedPath" :read-only="ctx.readOnly" :auto-size="autoSize"
        show-auto-size @update="onSettingsUpdate" @select="uploadFile" @remove="removeImage" />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { error as logError } from '@tauri-apps/plugin-log'

import type { ImageBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'
import ImageCardView from './ImageBlock/ImageCardView.vue'
import ImageSettings from './ImageBlock/ImageSettings.vue'
import { baseNameOf, imageExtensionOf, toImageFit } from './ImageBlock/imageConfig.ts'
import { getErrorMessage } from '../../../utils/getErrorMessage.ts'

interface ImageCardHandle {
  openPicker: () => void
  showError: (message: string) => void
  naturalSize: () => Promise<{ w: number; h: number } | null>
}

const ctx = useBlockContext<ImageBlockConfig>()
const cardRef = ref<ImageCardHandle | null>(null)
const storedPath = computed(() => String(ctx.config.path ?? ''))
const imageMime = computed(() => String(ctx.config.mime ?? ''))
const imageAlt = computed(() => String(ctx.config.alt ?? ''))
const fit = computed(() => toImageFit(ctx.config.fit))
const autoSize = computed(() => ctx.config.autoSize === true)

const logFailure = (message: string, cause: unknown) => {
  if (isTauri()) void logError(`${message}：${getErrorMessage(cause)}`)
}

// 每次图片加载完都报一次尺寸，自动大小开关与换图共用同一条路径
const onImageLoaded = async () => {
  if (!autoSize.value) return
  const size = await cardRef.value?.naturalSize()
  if (size && size.w > 0 && size.h > 0) ctx.resizeTo(size)
}

const deleteStaleFile = async (previousPath: string, nextPath: string) => {
  if (!previousPath || previousPath === nextPath) return
  try {
    await ctx.files.remove(previousPath)
  } catch (cause) {
    // 旧文件残留不影响新图显示，只记日志
    logFailure('清理旧图片失败', cause)
  }
}

const uploadFile = async (file: File) => {
  const nextPath = `image.${imageExtensionOf(file.type)}`
  try {
    await ctx.files.write(nextPath, new Uint8Array(await file.arrayBuffer()))
    await deleteStaleFile(storedPath.value, nextPath)
    ctx.setConfig({ path: nextPath, mime: file.type, alt: imageAlt.value || baseNameOf(file.name) })
  } catch (cause) {
    cardRef.value?.showError(`保存图片失败：${getErrorMessage(cause)}`)
    logFailure('保存图片失败', cause)
  }
}

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  ctx.setConfig(patch)
  if (patch.autoSize === true) void onImageLoaded()
}

const removeImage = async () => {
  const path = storedPath.value
  if (!path) return
  ctx.setConfig({ path: '', mime: '', alt: imageAlt.value })
  try {
    await ctx.files.remove(path)
  } catch (cause) {
    logFailure('删除图片失败', cause)
  }
}
</script>
