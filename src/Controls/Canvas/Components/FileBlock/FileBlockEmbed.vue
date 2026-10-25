<template>
  <FileCardView ref="cardRef" :path="path" :name="name" :mime="mime" :size="size" :read-only="readOnly === true"
    :files="files" @select="uploadFile" @export="exportFile" @remove="removeFile" />
  <Teleport v-if="settingsHost" :to="settingsHost">
    <FileSettings :name="name" :size="size" :path="path" :read-only="readOnly === true" @select="uploadFile"
      @export="exportFile" @remove="removeFile" />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false })
import { isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

import { createBlockFiles } from '../../Sdk/blockFiles.ts'
import { EMBED_SETTINGS_HOST_KEY } from '../../Sdk/embedSettingsHost.ts'
import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'
import FileCardView from './FileCardView.vue'
import FileSettings from './FileSettings.vue'

const FILE_DATA_PATH = 'file.bin'
const MAX_FILE_BYTES = 64 * 1024 * 1024
const FALLBACK_FILE_NAME = 'attachment'

const props = defineProps<{
  path?: string
  name?: string
  mime?: string
  size?: number
  readOnly?: boolean
  blockUuid?: string
}>()

const emit = defineEmits<{ (e: 'update-props', patch: Record<string, unknown>): void }>()

const cardRef = ref<{ showError: (message: string) => void } | null>(null)
const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null))
// 旧节点可能没有 uuid，此时没有可用目录，只做展示
const files = computed(() => (props.blockUuid ? createBlockFiles(props.blockUuid) : null))
const path = computed(() => String(props.path ?? ''))
const name = computed(() => String(props.name ?? ''))
const mime = computed(() => String(props.mime ?? ''))
const size = computed(() => Number(props.size ?? 0))

const uploadFile = async (file: File) => {
  if (!files.value) {
    cardRef.value?.showError('这个附件没有存储目录，请拖出到画布后再更换')
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    cardRef.value?.showError('附件超过 64 MiB 上限')
    return
  }
  try {
    await files.value.write(FILE_DATA_PATH, new Uint8Array(await file.arrayBuffer()))
    emit('update-props', { path: FILE_DATA_PATH, name: file.name, mime: file.type, size: file.size })
  } catch (cause) {
    cardRef.value?.showError(`保存附件失败：${getErrorMessage(cause)}`)
  }
}

const exportFile = async () => {
  const source = path.value
  if (!source) return
  try {
    if (!isTauri()) {
      if (!files.value) return
      const bytes = await files.value.readBinary(source)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime.value || 'application/octet-stream' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name.value || FALLBACK_FILE_NAME
      anchor.click()
      URL.revokeObjectURL(url)
      return
    }
    const targetPath = await save({ defaultPath: name.value || FALLBACK_FILE_NAME })
    if (!targetPath || !files.value) return
    await files.value.exportTo(source, targetPath)
  } catch (cause) {
    cardRef.value?.showError(`导出附件失败：${getErrorMessage(cause)}`)
  }
}

const removeFile = async () => {
  const source = path.value
  if (!source) return
  emit('update-props', { path: '', name: '', mime: '', size: 0 })
  if (!files.value) return
  try {
    await files.value.remove(source)
  } catch {
    // 归档条目残留不影响显示
  }
}
</script>
