<script setup lang="ts">
import { mdiCheckCircle, mdiDownload, mdiRefresh } from '@mdi/js';
import { isTauri } from '@tauri-apps/api/core';
import { computed, ref } from 'vue';

import {
  applyUpdate,
  checkForUpdates,
  readUpdateChannel,
  saveUpdateChannel,
  type UpdateChannel,
} from '../../lib/updater';

type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'installing' | 'failed';

const CHANNEL_OPTIONS: { value: UpdateChannel; title: string }[] = [
  { value: 'stable', title: '稳定版' },
  { value: 'beta', title: '测试版' },
  { value: 'alpha', title: '预览版' },
];

const isDesktop = isTauri();
const channel = ref<UpdateChannel>(readUpdateChannel());
const state = ref<UpdateState>('idle');
const latestVersion = ref('');
const errorMessage = ref('');

const isBusy = computed(() => state.value === 'checking' || state.value === 'installing');

const statusText = computed(() => {
  switch (state.value) {
    case 'checking':
      return '正在检查更新…';
    case 'latest':
      return '当前已是最新版本。';
    case 'available':
      return `发现新版本 ${latestVersion.value}`;
    case 'installing':
      return '正在下载并安装，完成后应用会自动重启。';
    case 'failed':
      return errorMessage.value;
    default:
      return isDesktop ? '点击检查更新获取最新版本。' : '更新仅在桌面版可用。';
  }
});

function handleChannelChange(value: unknown) {
  const matched = CHANNEL_OPTIONS.find((item) => item.value === value);
  if (!matched) return;
  channel.value = matched.value;
  saveUpdateChannel(matched.value);
  state.value = 'idle';
}

async function runCheck() {
  if (!isDesktop || isBusy.value) return;
  state.value = 'checking';
  errorMessage.value = '';
  try {
    const result = await checkForUpdates();
    if (!result.available) {
      state.value = 'latest';
      return;
    }
    latestVersion.value = result.version;
    state.value = 'available';
  } catch (error) {
    errorMessage.value = `检查更新失败：${describeError(error)}`;
    state.value = 'failed';
  }
}

async function runInstall() {
  if (!isDesktop || isBusy.value) return;
  state.value = 'installing';
  errorMessage.value = '';
  try {
    await applyUpdate();
  } catch (error) {
    errorMessage.value = `安装更新失败：${describeError(error)}`;
    state.value = 'failed';
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
</script>

<template>
  <section class="about-update" aria-label="应用更新">
    <div class="update-heading">
      <h2>应用更新</h2>
      <p>从官方发布渠道获取新版本，安装后应用会自动重启。</p>
    </div>
    <div class="update-controls">
      <v-select
        :model-value="channel"
        :items="CHANNEL_OPTIONS"
        item-title="title"
        item-value="value"
        :disabled="!isDesktop || isBusy"
        class="update-channel"
        density="comfortable"
        variant="outlined"
        label="更新渠道"
        hide-details
        @update:model-value="handleChannelChange"
      />
      <v-btn
        v-if="state === 'available' || state === 'installing'"
        :prepend-icon="mdiDownload"
        color="primary"
        :loading="state === 'installing'"
        :disabled="!isDesktop"
        @click="runInstall"
        >下载并安装</v-btn
      >
      <v-btn
        v-else
        :prepend-icon="mdiRefresh"
        color="primary"
        variant="tonal"
        :loading="state === 'checking'"
        :disabled="!isDesktop"
        @click="runCheck"
        >检查更新</v-btn
      >
    </div>
    <div class="text-caption update-status" :class="{ 'text-error': state === 'failed' }">
      <v-icon v-if="state === 'latest'" :icon="mdiCheckCircle" size="16" />
      {{ statusText }}
    </div>
  </section>
</template>

<style scoped>
/* 主题的 surface-variant 在部分配色里与页面底色几乎相同，所以用主色掺面色的方式自己叠一层，跟主题走 */
.about-update {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-primary)) 32%, transparent);
  border-radius: 8px;
  background-color: color-mix(
    in srgb,
    rgb(var(--v-theme-primary)) 10%,
    rgb(var(--v-theme-surface))
  );
}

.update-heading h2 {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}

.update-heading p {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.875rem;
  line-height: 1.5;
}

.update-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.update-channel {
  max-width: 240px;
}

.update-status {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.8;
}
</style>
