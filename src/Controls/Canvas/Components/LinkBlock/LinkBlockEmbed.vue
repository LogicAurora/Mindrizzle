<template>
  <LinkCardView :url="url" :title="title" :description="description" :site-name="siteName" :image-url="imageUrl"
    :read-only="readOnly === true" @update="onUpdate" />
  <Teleport v-if="settingsHost" :to="settingsHost">
    <LinkSettings :url="url" :title="title" :description="description" :image-url="imageUrl"
      :read-only="readOnly === true" @update="onUpdate" />
  </Teleport>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false })

import { EMBED_SETTINGS_HOST_KEY } from '../../Sdk/embedSettingsHost.ts'
import LinkCardView from './LinkCardView.vue'
import LinkSettings from './LinkSettings.vue'

withDefaults(defineProps<{
  url?: string
  title?: string
  description?: string
  siteName?: string
  imageUrl?: string
  readOnly?: boolean
}>(), {
  url: '',
  title: '',
  description: '',
  siteName: '',
  imageUrl: '',
})

const emit = defineEmits<{ (e: 'update-props', patch: Record<string, unknown>): void }>()

const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null))

const onUpdate = (patch: Record<string, unknown>) => {
  emit('update-props', patch)
}
</script>
