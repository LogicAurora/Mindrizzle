<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core'
import { mdiTuneVariant } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import MdrSettingsPageBase from './MdrSettingsPageBase.vue'
import { isLinuxPlatform } from '../../utils/platform'
import { getSetting, setSetting } from '../../utils/settingsStore'

type DmabufRendererMode = 'off' | 'disable-renderer' | 'force-shm'

const DMABUF_RENDERER_MODE_SETTING_KEY = 'advanced.dmabufRendererMode'
const DMABUF_RENDERER_MODE_OPTIONS = [
  { title: '关闭', value: 'off' },
  { title: 'WEBKIT_DISABLE_DMABUF_RENDERER=1', value: 'disable-renderer' },
  { title: 'WEBKIT_DMABUF_RENDERER_FORCE_SHM=1', value: 'force-shm' },
] satisfies Array<{ title: string, value: DmabufRendererMode }>

const isDesktop = isTauri()

const dmabufRendererMode = ref<DmabufRendererMode>('off')
const isLoaded = ref(false)
const settingsError = ref('')
const hintText = computed(() => {
  if (!isDesktop) return '仅在桌面版可用。'
  if (!isLinuxPlatform) return '仅 Linux 桌面版可用。'
  return '修改后需重启应用才生效。'
})

function isDmabufRendererMode(value: unknown): value is DmabufRendererMode {
  return DMABUF_RENDERER_MODE_OPTIONS.some((option) => option.value === value)
}

function reportSettingsError(error: unknown) {
  settingsError.value = error instanceof Error ? error.message : String(error)
}

async function loadDmabufRendererMode() {
  if (!isDesktop) {
    isLoaded.value = true
    return
  }
  try {
    const savedMode = await getSetting<unknown>(DMABUF_RENDERER_MODE_SETTING_KEY)
    if (isDmabufRendererMode(savedMode)) dmabufRendererMode.value = savedMode
  } catch (error) {
    reportSettingsError(error)
  } finally {
    isLoaded.value = true
  }
}

async function updateDmabufRendererMode(value: unknown) {
  if (!isDmabufRendererMode(value)) return
  const previousMode = dmabufRendererMode.value
  dmabufRendererMode.value = value
  try {
    await setSetting(DMABUF_RENDERER_MODE_SETTING_KEY, value)
  } catch (error) {
    dmabufRendererMode.value = previousMode
    reportSettingsError(error)
  }
}

onMounted(() => {
  void loadDmabufRendererMode()
})
</script>

<template>
  <MdrSettingsPageBase title="高级" subtitle="调整底层的渲染与诊断选项。" :icon="mdiTuneVariant">
    <section class="settings-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">窗口闪烁修复</div>
          <div class="settings-section-caption">
            WebKitGTK 在 Wayland 下用 DMABUF 合成会整窗闪烁，换一种缓冲传输方式可绕过；仅 Linux 桌面版生效。
          </div>
        </div>
      </div>
      <v-select :model-value="dmabufRendererMode" :items="DMABUF_RENDERER_MODE_OPTIONS"
        :disabled="!isDesktop || !isLinuxPlatform || !isLoaded" label="DMABUF 渲染模式" hide-details
        class="dmabuf-renderer-select" @update:model-value="updateDmabufRendererMode" />
      <div class="text-caption mt-2">{{ hintText }}</div>
      <div v-if="settingsError" class="text-error text-caption mt-2">{{ settingsError }}</div>
    </section>
  </MdrSettingsPageBase>
</template>

<style scoped>
.dmabuf-renderer-select {
  max-width: 480px;
}
</style>
