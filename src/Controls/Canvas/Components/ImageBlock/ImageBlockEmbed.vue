<template>
  <ImageCardView ref="cardRef" :path="path" :mime="mime" :alt="alt" :fit="fit" :read-only="readOnly === true"
    :files="files" @select="uploadFile"/>
  <Teleport v-if="settingsHost" :to="settingsHost">
    <ImageSettings :alt="alt" :fit="fit" :path="path" :read-only="readOnly === true" @update="onSettingsUpdate"
      @select="uploadFile" @remove="removeImage" />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false })

import { createBlockFiles } from '../../Sdk/blockFiles.ts'
import { EMBED_SETTINGS_HOST_KEY } from '../../Sdk/embedSettingsHost.ts'
import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'
import ImageCardView from './ImageCardView.vue'
import ImageSettings from './ImageSettings.vue'
import { baseNameOf, imageExtensionOf, toImageFit } from './imageConfig.ts'

const props = defineProps<{
  path?: string
  mime?: string
  alt?: string
  fit?: string
  readOnly?: boolean
  blockUuid?: string
}>()

const emit = defineEmits<{ (e: 'update-props', patch: Record<string, unknown>): void }>()

const cardRef = ref<{ showError: (message: string) => void } | null>(null)
const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null))
// 旧节点可能没有 uuid，此时没有可用目录，只做展示
const files = computed(() => (props.blockUuid ? createBlockFiles(props.blockUuid) : null))
const path = computed(() => String(props.path ?? ''))
const mime = computed(() => String(props.mime ?? ''))
const alt = computed(() => String(props.alt ?? ''))
const fit = computed(() => toImageFit(props.fit))

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  emit('update-props', patch)
}

const removeImage = () => {
  emit('update-props', { path: '', mime: '', alt: alt.value })
}

const uploadFile = async (file: File) => {
  if (!files.value) {
    cardRef.value?.showError('这张图片没有存储目录，请拖出到画布后再更换')
    return
  }
  const nextPath = `image.${imageExtensionOf(file.type)}`
  try {
    await files.value.write(nextPath, new Uint8Array(await file.arrayBuffer()))
    if (path.value && path.value !== nextPath) {
      await files.value.remove(path.value).catch(() => {
        // 旧文件残留不影响显示
      })
    }
    emit('update-props', { path: nextPath, mime: file.type, alt: alt.value || baseNameOf(file.name) })
  } catch (cause) {
    cardRef.value?.showError(`保存图片失败：${getErrorMessage(cause)}`)
  }
}
</script>
