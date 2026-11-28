<script setup lang="ts">
import { mdiDownload } from '@mdi/js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { computed } from 'vue';

import {
  closeUpdateDialog,
  installUpdate,
  isUpdateBusy,
  isUpdateDialogOpen,
  isUpdatePreview,
  updateError,
  updateInfo,
  updatePercent,
  updatePhase,
} from '../lib/updateStore';

const isOpen = computed({
  get: () => isUpdateDialogOpen.value,
  set: (value: boolean) => {
    if (!value) closeUpdateDialog();
  },
});

// 更新日志来自发布清单里的 Markdown，渲染后必须过滤再进 v-html
const notesHtml = computed(() => {
  const notes = updateInfo.value?.notes?.trim();
  return notes ? DOMPurify.sanitize(marked.parse(notes, { async: false })) : '';
});

const statusText = computed(() => {
  if (updatePhase.value === 'downloading') {
    return updatePercent.value === null ? '正在下载更新…' : `正在下载更新 ${updatePercent.value}%`;
  }
  if (updatePhase.value === 'installing') return '正在安装更新，完成后应用会自动重启…';
  return '';
});
</script>

<template>
  <v-dialog v-model="isOpen" max-width="560" scrollable>
    <v-card>
      <v-card-item>
        <v-card-title>发现新版本 {{ updateInfo?.version }}</v-card-title>
        <v-card-subtitle>当前版本 {{ updateInfo?.currentVersion }}</v-card-subtitle>
      </v-card-item>
      <v-card-text class="update-notes">
        <div v-if="notesHtml" v-html="notesHtml" />
        <p v-else class="text-medium-emphasis">该版本未提供更新说明。</p>
        <p v-if="statusText" class="text-medium-emphasis update-status">{{ statusText }}</p>
        <p v-if="isUpdatePreview" class="text-medium-emphasis update-status">
          预览模式：不会真正下载安装。
        </p>
        <v-progress-linear
          v-if="statusText"
          class="mt-2"
          :model-value="updatePercent ?? 0"
          :indeterminate="updatePercent === null"
          height="4"
          rounded
        />
        <p v-if="updatePhase === 'failed' && updateError" class="text-error update-status">
          {{ updateError }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="isUpdateBusy" @click="closeUpdateDialog">稍后</v-btn>
        <v-btn
          v-if="updatePhase === 'available'"
          color="primary"
          :prepend-icon="mdiDownload"
          :disabled="isUpdatePreview"
          @click="installUpdate"
          >下载并安装</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.update-notes {
  max-height: 360px;
  overflow-y: auto;
  line-height: 1.6;
}

.update-notes :deep(h1),
.update-notes :deep(h2),
.update-notes :deep(h3) {
  margin: 12px 0 6px;
  font-size: 0.95rem;
  font-weight: 600;
}

.update-notes :deep(h1:first-child),
.update-notes :deep(h2:first-child),
.update-notes :deep(h3:first-child) {
  margin-top: 0;
}

.update-notes :deep(ul) {
  padding-left: 20px;
  list-style: disc;
}

.update-notes :deep(a) {
  color: rgb(var(--v-theme-primary));
}

.update-notes :deep(code) {
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  font-size: 0.85em;
}

.update-status {
  margin-top: 12px;
  font-size: 0.85rem;
}
</style>
