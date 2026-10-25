<template>
  <BlockShell>
    <LinkCardView :url="rawUrl" :title="title" :description="description" :site-name="siteName"
      :image-url="imageUrl" :read-only="ctx.readOnly" @update="onUpdate" />

    <template #settings>
      <LinkSettings :url="rawUrl" :title="title" :description="description" :image-url="imageUrl"
        :read-only="ctx.readOnly" @update="onUpdate" />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { LinkBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'
import LinkCardView from './LinkBlock/LinkCardView.vue'
import LinkSettings from './LinkBlock/LinkSettings.vue'

const ctx = useBlockContext<LinkBlockConfig>()
const rawUrl = computed(() => String(ctx.config.url ?? ''))
const title = computed(() => String(ctx.config.title ?? ''))
const description = computed(() => String(ctx.config.description ?? ''))
const siteName = computed(() => String(ctx.config.siteName ?? ''))
const imageUrl = computed(() => String(ctx.config.imageUrl ?? ''))

const onUpdate = (patch: Record<string, unknown>) => {
  ctx.setConfig(patch)
}
</script>

