<template>
  <BlockShell>
    <FileCardView ref="cardRef" :path="storedPath" :name="fileName" :mime="fileMime" :size="fileSize"
      :read-only="ctx.readOnly" :files="ctx.files" @select="uploadFile" @export="exportFile" @remove="removeFile" />

    <template #settings>
      <FileSettings :name="fileName" :size="fileSize" :path="storedPath" :read-only="ctx.readOnly"
        @select="uploadFile" @export="exportFile" @remove="removeFile" />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { error as logError } from '@tauri-apps/plugin-log'
import type { FileBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'
import FileCardView from './FileBlock/FileCardView.vue'
import FileSettings from './FileBlock/FileSettings.vue'
import { getErrorMessage } from '../../../utils/getErrorMessage.ts'

// 归档内路径固定，换附件只覆盖同一份文件，避免留下无法回收的旧条目
const FILE_DATA_PATH = 'file.bin'
// 与 Rust 侧 COMPONENT_FILE_MAX_BYTES 一致，前端先拦一次省掉整包重打的失败开销
const MAX_FILE_BYTES = 64 * 1024 * 1024
const FALLBACK_FILE_NAME = 'attachment'

const ctx = useBlockContext<FileBlockConfig>()
const fileName = computed(() => String(ctx.config.name ?? ''))
const fileMime = computed(() => String(ctx.config.mime ?? ''))
const fileSize = computed(() => Number(ctx.config.size ?? 0))
const storedPath = computed(() => String(ctx.config.path ?? ''))
const cardRef = ref<{ openPicker: () => void; showError: (message: string) => void } | null>(null)

// 日志不可用时不能影响主流程
const reportFailure = (message: string, cause: unknown) => {
  if (isTauri()) void logError(`${message}：${getErrorMessage(cause)}`)
}

const uploadFile = async (file: File) => {
  if (file.size > MAX_FILE_BYTES) {
    cardRef.value?.showError('附件超过 64 MiB 上限')
    return
  }
  try {
    await ctx.files.write(FILE_DATA_PATH, new Uint8Array(await file.arrayBuffer()))
    ctx.setConfig({ path: FILE_DATA_PATH, name: file.name, mime: file.type, size: file.size })
  } catch (cause) {
    cardRef.value?.showError(`保存附件失败：${getErrorMessage(cause)}`)
    reportFailure('保存附件失败', cause)
  }
}

const downloadBlob = (bytes: Uint8Array) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: fileMime.value || 'application/octet-stream' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName.value || FALLBACK_FILE_NAME
  anchor.click()
  URL.revokeObjectURL(url)
}

const exportFile = async () => {
  const path = storedPath.value
  if (!path) return
  try {
    const bytes = await ctx.files.readBinary(path)
    if (!isTauri()) {
      downloadBlob(bytes)
      return
    }
    const targetPath = await save({ defaultPath: fileName.value || FALLBACK_FILE_NAME })
    if (!targetPath) return
    await ctx.files.exportTo(path, targetPath)
  } catch (cause) {
    cardRef.value?.showError(`导出附件失败：${getErrorMessage(cause)}`)
    reportFailure('导出附件失败', cause)
  }
}

const removeFile = async () => {
  const path = storedPath.value
  if (!path) return
  ctx.setConfig({ path: '', name: '', mime: '', size: 0 })
  try {
    await ctx.files.remove(path)
  } catch (cause) {
    // 归档条目残留不影响块显示，只记日志
    reportFailure('删除附件失败', cause)
  }
}
</script>
