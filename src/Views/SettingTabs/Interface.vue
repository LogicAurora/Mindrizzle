<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { isTitleRollDirection, loadTitleRollDirection, saveTitleRollDirection, titleRollDirection } from '../../utils/uiPreference'

const settingsError = ref('')

function reportSettingsError(error: unknown) {
  settingsError.value = error instanceof Error ? error.message : String(error)
}

function selectTitleRollDirection(direction: unknown) {
  // 按钮组挂载时会带着当前值回调一次，相同值直接忽略，避免覆盖尚未读回的偏好
  if (!isTitleRollDirection(direction) || direction === titleRollDirection.value) return
  void saveTitleRollDirection(direction).catch(reportSettingsError)
}

onMounted(() => {
  void loadTitleRollDirection().catch(reportSettingsError)
})
</script>
<template>
  <v-container>
    <div class="text-subtitle-1">工具栏标题滚动方向</div>
    <div class="text-caption mb-3">切换页面时标题的滚动动画方向，默认从上往下。</div>
    <v-btn-toggle
      :model-value="titleRollDirection"
      mandatory
      divided
      @update:model-value="selectTitleRollDirection"
    >
      <v-btn value="top-down">从上往下</v-btn>
      <v-btn value="bottom-up">从下往上</v-btn>
    </v-btn-toggle>
    <div v-if="settingsError" class="text-error text-caption mt-2">{{ settingsError }}</div>
  </v-container>
</template>
