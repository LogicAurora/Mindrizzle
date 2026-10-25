<template>
  <div class="link-view">
    <div v-if="hasUrl" class="link-card" @dblclick="openLink">
      <img v-if="coverUrl && !coverFailed" class="link-cover" :src="coverUrl" :alt="displayTitle"
        @error="coverFailed = true" />
      <div class="link-body">
        <span class="link-title" :title="displayTitle">{{ displayTitle }}</span>
        <span v-if="description" class="link-desc">{{ description }}</span>
        <span class="link-host">{{ hostLabel }}</span>
      </div>
    </div>

    <div v-else class="link-empty">
      <v-icon :icon="mdiLinkVariant" size="36" class="text-medium-emphasis" />
      <v-text-field v-model="draftUrl" placeholder="粘贴网址" density="compact" variant="outlined" hide-details
        :readonly="readOnly" @keydown.enter.prevent="applyDraft" />
      <v-btn size="small" variant="tonal" color="primary" :disabled="readOnly" :loading="isFetching"
        @click="applyDraft">
        保存并读取
      </v-btn>
    </div>

    <div v-if="notice" class="link-notice">{{ notice }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { mdiLinkVariant } from '@mdi/js'

import { getErrorMessage } from '../../../../utils/getErrorMessage.ts'
import { fetchLinkMeta, parseHttpUrl, resolveUrl } from './linkMeta.ts'

const FETCH_TIMEOUT_MS = 8000

const props = defineProps<{
  url: string
  title: string
  description: string
  siteName: string
  imageUrl: string
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update', patch: Record<string, unknown>): void }>()

const draftUrl = ref('')
const notice = ref('')
const isFetching = ref(false)
const coverFailed = ref(false)
let abortController: AbortController | null = null

const hasUrl = computed(() => props.url !== '')
const parsedUrl = computed(() => parseHttpUrl(props.url))
const coverUrl = computed(() => resolveUrl(props.imageUrl, parsedUrl.value?.href ?? ''))
const hostLabel = computed(() => parsedUrl.value?.hostname ?? props.url)
const displayTitle = computed(() => props.title || hostLabel.value)

watch(coverUrl, () => { coverFailed.value = false })
onBeforeUnmount(() => { abortController?.abort() })

// 刚写入的网址还不在 props 里，所以允许显式传目标
const fetchPreview = async (target?: string) => {
  const url = target ?? parsedUrl.value?.href
  if (!url || isFetching.value) return
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller
  isFetching.value = true
  notice.value = ''
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const meta = await fetchLinkMeta(url, controller.signal)
    emit('update', {
      title: meta.title || props.title,
      description: meta.description || props.description,
      siteName: meta.siteName || props.siteName,
      imageUrl: meta.imageUrl || props.imageUrl,
    })
    if (!meta.title && !meta.description) notice.value = '没有读到标题或描述，可以手动填写'
  } catch (cause) {
    notice.value = `读取失败，请手动填写标题（${getErrorMessage(cause)}）`
  } finally {
    window.clearTimeout(timer)
    if (abortController === controller) abortController = null
    isFetching.value = false
  }
}

const applyDraft = async () => {
  const url = parseHttpUrl(draftUrl.value)
  if (!url) {
    notice.value = '网址无效，需要 http 或 https 开头'
    return
  }
  emit('update', { url: url.href })
  draftUrl.value = ''
  notice.value = ''
  await fetchPreview(url.href)
}

defineExpose({ fetchPreview: () => fetchPreview() })

const openLink = () => {
  const url = parsedUrl.value?.href
  if (!url) return
  if (isTauri()) {
    void openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.link-view {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.link-card {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  cursor: pointer;
}

.link-cover {
  flex: 0 0 34%;
  width: 34%;
  height: 100%;
  object-fit: cover;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.link-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  user-select: text;
}

.link-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-desc {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.link-host {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
}

.link-empty .v-text-field {
  max-width: 260px;
}

.link-notice {
  position: absolute;
  inset: auto 8px 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.9);
  color: rgba(var(--v-theme-on-surface), 0.75);
}
</style>
