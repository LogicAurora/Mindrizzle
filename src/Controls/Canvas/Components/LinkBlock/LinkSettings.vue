<template>
  <div class="d-flex flex-column ga-3 pa-3">
    <v-text-field
      v-model="draftUrl"
      label="网址"
      density="compact"
      variant="outlined"
      hide-details
      :readonly="readOnly"
      @blur="commitUrl"
      @keydown.enter.prevent="commitUrl"
    />
    <v-text-field
      :model-value="title"
      label="标题"
      density="compact"
      variant="outlined"
      hide-details
      :readonly="readOnly"
      @update:model-value="(value) => emitUpdate({ title: String(value ?? '') })"
    />
    <v-textarea
      :model-value="description"
      label="描述"
      rows="2"
      density="compact"
      variant="outlined"
      hide-details
      :readonly="readOnly"
      @update:model-value="(value) => emitUpdate({ description: String(value ?? '') })"
    />
    <v-text-field
      :model-value="imageUrl"
      label="封面地址"
      density="compact"
      variant="outlined"
      hide-details
      :readonly="readOnly"
      @update:model-value="(value) => emitUpdate({ imageUrl: String(value ?? '') })"
    />
    <div v-if="notice" class="text-caption text-medium-emphasis text-break">
      {{ notice }}
    </div>
    <div class="d-flex flex-wrap ga-2 justify-end">
      <v-btn
        size="small"
        variant="tonal"
        :prepend-icon="mdiRefresh"
        :disabled="!url || isFetching"
        @click="refresh"
      >
        读取
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        :prepend-icon="mdiOpenInNew"
        :disabled="!url"
        @click="openLink"
      >
        打开
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="error"
        :disabled="readOnly || !url"
        @click="clearLink"
        >清空</v-btn
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { mdiOpenInNew, mdiRefresh } from '@mdi/js';

import { getErrorMessage } from '../../../../utils/getErrorMessage.ts';
import { useAutoHideNotice } from '../../../../utils/useAutoHideNotice.ts';
import { fetchLinkMeta, parseHttpUrl } from './linkMeta.ts';

const FETCH_TIMEOUT_MS = 8000;

const props = defineProps<{
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  readOnly: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', patch: Record<string, unknown>): void;
}>();

const emitUpdate = (patch: Record<string, unknown>) => emit('update', patch);
const isFetching = ref(false);
const { notice, showNotice, clearNotice } = useAutoHideNotice();
const draftUrl = ref(props.url);

// 逐键写回规范化 href 会在光标后补斜杠，所以网址只在失焦或回车时提交
watch(
  () => props.url,
  (next) => {
    const draft = parseHttpUrl(draftUrl.value);
    if (draft && draft.href === next) return;
    draftUrl.value = next;
  },
);

// 跨域站点读不到 HTML 是浏览器策略，失败时提示手填
const refresh = async () => {
  const parsed = parseHttpUrl(props.url);
  if (!parsed || isFetching.value) return;
  isFetching.value = true;
  clearNotice();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const meta = await fetchLinkMeta(parsed.href, controller.signal);
    emitUpdate({
      title: meta.title || props.title,
      description: meta.description || props.description,
      siteName: meta.siteName,
      imageUrl: meta.imageUrl || props.imageUrl,
    });
    if (!meta.title && !meta.description) showNotice('没有读到标题或描述');
  } catch (cause) {
    showNotice(`读取失败：${getErrorMessage(cause)}`);
  } finally {
    window.clearTimeout(timer);
    isFetching.value = false;
  }
};

const openLink = () => {
  const parsed = parseHttpUrl(props.url);
  if (!parsed) return;
  if (isTauri()) {
    void openUrl(parsed.href);
    return;
  }
  window.open(parsed.href, '_blank', 'noopener,noreferrer');
};

// 输入过程中只保存能解析的值，非法输入不提交也不覆盖已存的网址
const commitUrl = () => {
  if (props.readOnly || draftUrl.value === props.url) return;
  if (!draftUrl.value.trim()) {
    clearNotice();
    emitUpdate({ url: '' });
    return;
  }
  const url = parseHttpUrl(draftUrl.value);
  if (!url) {
    showNotice('网址无效，需要 http 或 https 开头');
    return;
  }
  clearNotice();
  emitUpdate({ url: url.href });
};

const clearLink = () =>
  emitUpdate({
    url: '',
    title: '',
    description: '',
    siteName: '',
    imageUrl: '',
  });
</script>
