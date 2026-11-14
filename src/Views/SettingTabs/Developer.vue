<script setup lang="ts">
import { mdiBug, mdiFlaskOutline, mdiTelescope } from '@mdi/js';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import MdrSettingsPageBase from './MdrSettingsPageBase.vue';
import { isDeveloperMode, saveDeveloperMode } from '../../utils/developerMode';

const router = useRouter();
const settingsError = ref('');

function reportSettingsError(error: unknown) {
  settingsError.value = error instanceof Error ? error.message : String(error);
}

function updateDeveloperMode(value: unknown) {
  void saveDeveloperMode(value === true).catch(reportSettingsError);
}

function openDebugPage() {
  void router.push('/debug');
}
</script>

<template>
  <MdrSettingsPageBase title="开发者" subtitle="调试入口与测试块。" :icon="mdiBug">
    <section class="settings-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">开发者模式</div>
          <div class="settings-section-caption">
            开启后左侧菜单出现调试页，添加块的轮盘里出现测试台；关闭只隐藏入口，已有块照常渲染。
          </div>
        </div>
      </div>
      <v-switch
        :model-value="isDeveloperMode"
        color="primary"
        label="启用开发者工具"
        hide-details
        @update:model-value="updateDeveloperMode"
      />
      <div v-if="settingsError" class="text-error text-caption mt-2">
        {{ settingsError }}
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">快捷入口</div>
          <div class="settings-section-caption">
            调试页提供路由跳转、网页储存清理与便签列表的渲染压测。
          </div>
        </div>
      </div>
      <div class="developer-actions">
        <v-btn :prepend-icon="mdiTelescope" variant="tonal" @click="openDebugPage"
          >打开调试页面</v-btn
        >
        <v-chip :prepend-icon="mdiFlaskOutline" variant="tonal" size="small"
          >测试台块：添加块轮盘最后一项</v-chip
        >
      </div>
    </section>
  </MdrSettingsPageBase>
</template>

<style scoped>
.developer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>
