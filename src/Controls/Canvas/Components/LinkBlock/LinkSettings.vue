<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-text-field :model-value="url" label="网址" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="onUrlInput" />
    </v-list-item>
    <v-list-item class="px-3">
      <v-text-field :model-value="title" label="标题" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="(value) => emitUpdate({ title: String(value ?? '') })" />
    </v-list-item>
    <v-list-item class="px-3">
      <v-textarea :model-value="description" label="描述" rows="2" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="(value) => emitUpdate({ description: String(value ?? '') })" />
    </v-list-item>
    <v-list-item class="px-3">
      <v-text-field :model-value="imageUrl" label="封面地址" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @update:model-value="(value) => emitUpdate({ imageUrl: String(value ?? '') })" />
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 justify-end px-3">
      <v-btn size="small" variant="tonal" :prepend-icon="mdiRefresh" :disabled="!url || isFetching" @click="refresh">
        读取
      </v-btn>
      <v-btn size="small" variant="tonal" :prepend-icon="mdiOpenInNew" :disabled="!url" @click="openLink">
        打开
      </v-btn>
      <v-btn size="small" variant="text" color="error" :disabled="readOnly || !url" @click="clearLink">清空</v-btn>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { mdiOpenInNew, mdiRefresh } from '@mdi/js'

import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'
import { fetchLinkMeta, parseHttpUrl } from './linkMeta.ts'

const FETCH_TIMEOUT_MS = 8000

const props = defineProps<{
  url: string
  title: string
  description: string
  imageUrl: string
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update', patch: Record<string, unknown>): void }>()

const emitUpdate = (patch: Record<string, unknown>) => emit('update', patch)
const isFetching = ref(false)
const notice = ref('')

// 跨域站点读不到 HTML 是浏览器策略，失败时提示手填
const refresh = async () => {
  const parsed = parseHttpUrl(props.url)
  if (!parsed || isFetching.value) return
  isFetching.value = true
  notice.value = ''
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const meta = await fetchLinkMeta(parsed.href, controller.signal)
    emitUpdate({
      title: meta.title || props.title,
      description: meta.description || props.description,
      siteName: meta.siteName,
      imageUrl: meta.imageUrl || props.imageUrl,
    })
    if (!meta.title && !meta.description) notice.value = '没有读到标题或描述'
  } catch (cause) {
    notice.value = `读取失败：${getErrorMessage(cause)}`
  } finally {
    window.clearTimeout(timer)
    isFetching.value = false
  }
}

const openLink = () => {
  const parsed = parseHttpUrl(props.url)
  if (!parsed) return
  if (isTauri()) {
    void openUrl(parsed.href)
    return
  }
  window.open(parsed.href, '_blank', 'noopener,noreferrer')
}

// 输入过程中只保存能解析的值，非法输入不写回
const onUrlInput = (value: unknown) => {
  const url = parseHttpUrl(String(value ?? ''))
  if (url) emitUpdate({ url: url.href })
}

const clearLink = () => emitUpdate({ url: '', title: '', description: '', siteName: '', imageUrl: '' })
</script>
